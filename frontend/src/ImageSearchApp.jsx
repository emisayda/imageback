import React, { useState, useEffect } from 'react';
import { Search, Image, AlertCircle, RefreshCw } from 'lucide-react';

const BACKEND_URL = 'http://localhost:5000';
const POLLING_INTERVAL = 2000; // Poll every 2 seconds

// Custom Alert Component
const Alert = ({ children, variant = 'info', className = '' }) => {
  const bgColor = variant === 'destructive' ? 'bg-red-50' : 'bg-pink-50';
  const textColor = variant === 'destructive' ? 'text-red-800' : 'text-pink-800';
  const borderColor = variant === 'destructive' ? 'border-red-200' : 'border-pink-200';
  
  return (
    <div className={`${bgColor} ${textColor} p-4 rounded-xl border ${borderColor} backdrop-blur-sm shadow-sm ${className}`}>
      {children}
    </div>
  );
};

const ImageSearchApp = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [numImages, setNumImages] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);

  // Function to poll job status
  const pollJobStatus = async (id) => {
    try {
      const response = await fetch(`${BACKEND_URL}/status/${id}`);
      if (!response.ok) throw new Error('Failed to fetch job status');
      
      const status = await response.json();
      setJobStatus(status);

      if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
        clearInterval(pollingInterval);
        setPollingInterval(null);
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Error polling job status:', err);
      setError('Failed to get job status');
      clearInterval(pollingInterval);
      setPollingInterval(null);
      setIsLoading(false);
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setJobStatus(null);
    
    try {
      const response = await fetch(`${BACKEND_URL}/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          search_term: searchTerm,
          num_images: numImages
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start image scraping');
      }

      const data = await response.json();
      setJobId(data.job_id);
      
      // Start polling
      const interval = setInterval(() => pollJobStatus(data.job_id), POLLING_INTERVAL);
      setPollingInterval(interval);
    } catch (err) {
      setError('Failed to start image search. Please try again.');
      setIsLoading(false);
      console.error('Error:', err);
    }
  };

  const handleCancel = async () => {
    if (!jobId) return;
    
    try {
      const response = await fetch(`${BACKEND_URL}/cancel/${jobId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to cancel job');
      
      setError('Search cancelled');
      setIsLoading(false);
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    } catch (err) {
      console.error('Error cancelling job:', err);
    }
  };

  const renderProgress = () => {
    if (!jobStatus) return null;
    
    const progress = (jobStatus.images_scraped / jobStatus.total_images) * 100;
    
    return (
      <div className="w-full max-w-xl mx-auto mt-8">
        <div className="bg-pink-100 rounded-full h-4 overflow-hidden">
          <div 
            className="bg-pink-500 h-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-center mt-2 text-gray-600">
          {jobStatus.status === 'completed' ? 'Complete!' : 
           jobStatus.status === 'failed' ? 'Failed' :
           jobStatus.status === 'cancelled' ? 'Cancelled' :
           `Processing: ${jobStatus.images_scraped} of ${jobStatus.total_images} images`}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-pink-100 py-12">
      <div className="max-w-6xl mx-auto px-6 flex flex-col items-center space-y-12">
        <div className="text-center max-w-2xl">
          <h1 className="text-4xl font-bold mb-6 bg-gradient-to-r from-pink-400 to-pink-600 text-transparent bg-clip-text">
            Image Search
          </h1>
          <p className="text-gray-600">
            Search and discover high-quality images for your projects
          </p>
        </div>

        <div className="w-full max-w-xl">
          <Alert className="mb-8 text-center">
            <div className="flex justify-center items-start gap-2">
              <AlertCircle className="h-5 w-5 mt-1 flex-shrink-0" />
              <div>
                <div className="font-semibold mb-1">Demo Application</div>
                <div className="text-sm opacity-90">
                  This is a demonstration. Please ensure compliance with usage terms in production.
                </div>
              </div>
            </div>
          </Alert>

          <form onSubmit={handleSubmit} className="space-y-8 bg-white p-8 rounded-2xl shadow-xl">
            <div className="text-center">
              <label htmlFor="search" className="block text-sm font-medium mb-3 text-gray-700">
                Search Term
              </label>
              <div className="relative group">
                <input
                  id="search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full p-4 pr-12 border border-pink-200 rounded-xl bg-pink-50/50 focus:bg-white transition-all duration-200 focus:ring-2 focus:ring-pink-400 focus:border-pink-400 outline-none text-center"
                  placeholder="Enter search term..."
                  required
                  disabled={isLoading}
                />
                <Search className="absolute right-4 top-4 h-5 w-5 text-pink-400 group-hover:text-pink-600 transition-colors duration-200" />
              </div>
            </div>

            <div className="text-center">
              <label htmlFor="numImages" className="block text-sm font-medium mb-3 text-gray-700">
                Number of Images
              </label>
              <input
                id="numImages"
                type="number"
                value={numImages}
                onChange={(e) => setNumImages(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                className="w-full p-4 border border-pink-200 rounded-xl bg-pink-50/50 focus:bg-white transition-all duration-200 focus:ring-2 focus:ring-pink-400 focus:border-pink-400 outline-none text-center"
                min="1"
                max="50"
                required
                disabled={isLoading}
              />
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-gradient-to-r from-pink-400 to-pink-600 text-white p-4 rounded-xl hover:from-pink-500 hover:to-pink-700 disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 font-medium"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Image className="h-5 w-5" />
                    Search Images
                  </>
                )}
              </button>
              
              {isLoading && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-6 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors duration-200"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {error && (
          <Alert variant="destructive" className="w-full max-w-xl text-center">
            <div className="flex justify-center items-start gap-2">
              <AlertCircle className="h-5 w-5 mt-1 flex-shrink-0" />
              <div>
                <div className="font-semibold">Error</div>
                <div className="text-sm opacity-90">{error}</div>
              </div>
            </div>
          </Alert>
        )}

        {renderProgress()}

        {jobStatus?.status === 'completed' && (
          <div className="text-center text-gray-700">
            <p className="mb-4">Images have been saved to:</p>
            <code className="bg-gray-100 px-4 py-2 rounded-lg">{jobStatus.folder_path}</code>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageSearchApp;