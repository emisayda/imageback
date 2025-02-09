from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
import os
import requests
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
import base64
import time
from datetime import datetime
import uuid
import logging
from fastapi.middleware.cors import CORSMiddleware

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Image Scraper API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class ScrapeRequest(BaseModel):
    search_term: str
    num_images: Optional[int] = 10
    folder_name: Optional[str] = None

class ScrapeResponse(BaseModel):
    job_id: str
    status: str
    folder_path: str

class JobStatus(BaseModel):
    job_id: str
    status: str
    images_scraped: int
    total_images: int
    folder_path: str

# Store job statuses in memory (in production, use a proper database)
job_statuses = {}

# Selenium driver setup
def create_driver():
    options = webdriver.ChromeOptions()
    options.add_argument("--headless")  # Run in headless mode
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    try:
        driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
        return driver
    except Exception as e:
        logger.error(f"Failed to create driver: {e}")
        raise HTTPException(status_code=500, detail="Failed to initialize web driver")

def scroll_down(driver, scroll_pause_time=2, scroll_limit=5):
    try:
        last_height = driver.execute_script("return document.body.scrollHeight")
        for i in range(scroll_limit):
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(scroll_pause_time)
            new_height = driver.execute_script("return document.body.scrollHeight")
            if new_height == last_height:
                break
            last_height = new_height
    except Exception as e:
        logger.error(f"Error during scrolling: {e}")
        raise HTTPException(status_code=500, detail="Failed to scroll page")

def scrape_all_images(driver):
    try:
        images = driver.find_elements(By.TAG_NAME, 'img')
        image_urls = []
        for img in images:
            image_url = img.get_attribute('src') or img.get_attribute('data-src')
            if image_url and "data:image/gif" not in image_url:
                width = int(img.get_attribute('width') or 0)
                height = int(img.get_attribute('height') or 0)
                if width >= 100 and height >= 100:
                    image_urls.append(image_url)
        return image_urls
    except Exception as e:
        logger.error(f"Error scraping images: {e}")
        raise HTTPException(status_code=500, detail="Failed to scrape images")

async def save_image(image_url, folder_path, file_name, retry_count=3):
    try:
        file_path = os.path.join(folder_path, f"{file_name}.jpg")

        if image_url.startswith('data:image/'):
            header, encoded = image_url.split(',', 1)
            image_data = base64.b64decode(encoded)
            with open(file_path, 'wb') as f:
                f.write(image_data)
        else:
            for attempt in range(retry_count):
                response = requests.get(image_url, timeout=10)
                if response.status_code == 200:
                    with open(file_path, 'wb') as f:
                        f.write(response.content)
                    break
                else:
                    logger.warning(f"Failed attempt {attempt+1} for image: {image_url}")
                    time.sleep(2)
    except Exception as e:
        logger.error(f"Error saving image {file_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save image: {str(e)}")

async def scrape_images_task(job_id: str, search_term: str, num_images: int, folder_path: str):
    try:
        driver = create_driver()
        driver.get(f"https://www.google.com/search?q={search_term}&tbm=isch")
        time.sleep(5)
        
        scroll_down(driver)
        image_urls = scrape_all_images(driver)
        image_urls = image_urls[:num_images]
        
        for index, image_url in enumerate(image_urls, start=1):
            if job_id in job_statuses:  # Check if job wasn't cancelled
                file_name = f'{search_term}_{index}'
                await save_image(image_url, folder_path, file_name)
                job_statuses[job_id]["images_scraped"] = index
                
        job_statuses[job_id]["status"] = "completed"
        driver.quit()
        
    except Exception as e:
        logger.error(f"Error in scraping task: {e}")
        job_statuses[job_id]["status"] = "failed"
        raise HTTPException(status_code=500, detail=f"Scraping task failed: {str(e)}")

@app.post("/scrape", response_model=ScrapeResponse)
async def start_scrape(request: ScrapeRequest, background_tasks: BackgroundTasks):
    try:
        # Generate unique job ID
        job_id = str(uuid.uuid4())
        
        # Create folder path
        folder_name = request.folder_name or f"scraped_images_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        folder_path = os.path.join("GoogleSearchImages", folder_name)
        os.makedirs(folder_path, exist_ok=True)
        
        # Initialize job status
        job_statuses[job_id] = {
            "status": "pending",
            "images_scraped": 0,
            "total_images": request.num_images,
            "folder_path": folder_path
        }
        
        # Start scraping task in background
        background_tasks.add_task(
            scrape_images_task,
            job_id,
            request.search_term,
            request.num_images,
            folder_path
        )
        
        return ScrapeResponse(
            job_id=job_id,
            status="pending",
            folder_path=folder_path
        )
        
    except Exception as e:
        logger.error(f"Error starting scrape job: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start scraping: {str(e)}")

@app.get("/status/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str):
    if job_id not in job_statuses:
        raise HTTPException(status_code=404, detail="Job not found")
        
    status = job_statuses[job_id]
    return JobStatus(
        job_id=job_id,
        status=status["status"],
        images_scraped=status["images_scraped"],
        total_images=status["total_images"],
        folder_path=status["folder_path"]
    )

@app.delete("/cancel/{job_id}")
async def cancel_job(job_id: str):
    if job_id not in job_statuses:
        raise HTTPException(status_code=404, detail="Job not found")
        
    if job_statuses[job_id]["status"] == "pending":
        job_statuses[job_id]["status"] = "cancelled"
        return {"message": "Job cancelled successfully"}
    else:
        raise HTTPException(status_code=400, detail="Job cannot be cancelled in its current state")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)