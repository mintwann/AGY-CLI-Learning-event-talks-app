document.addEventListener('DOMContentLoaded', () => {
    // State Variables
    let releasesData = [];
    let activeCategory = 'All';
    let searchQuery = '';
    let selectedUpdates = new Map(); // Map of updateId -> update object
    let selectedHashtags = new Set(['#BigQuery', '#GoogleCloud']);

    // DOM Elements
    const timelineContainer = document.getElementById('timeline-container');
    const feedLoader = document.getElementById('feed-loader');
    const feedError = document.getElementById('feed-error');
    const feedEmpty = document.getElementById('feed-empty');
    const errorMessage = document.getElementById('error-message');
    const btnRefresh = document.getElementById('btn-refresh');
    const btnRetry = document.getElementById('btn-retry');
    const refreshIcon = document.getElementById('refresh-icon');
    const searchInput = document.getElementById('search-input');
    const btnClearSearch = document.getElementById('btn-clear-search');
    
    // Stats Elements
    const statTotal = document.getElementById('stat-total');
    const statFeatures = document.getElementById('stat-features');
    const statBreaking = document.getElementById('stat-breaking');
    
    // Cache Indicator
    const cacheIndicator = document.getElementById('cache-indicator');
    const cacheStatusText = document.getElementById('cache-status-text');

    // Tweet Drawer Elements
    const tweetText = document.getElementById('tweet-text');
    const charCount = document.getElementById('char-count');
    const btnSendTweet = document.getElementById('btn-send-tweet');
    const composerStatus = document.getElementById('composer-status');

    // Toast
    const toast = document.getElementById('toast-notification');
    const toastText = document.getElementById('toast-text');

    // Initialize Page
    fetchReleases(false);
    setupEventListeners();

    // ==========================================================================
    // API CALLS
    // ==========================================================================
    async function fetchReleases(forceRefresh = false) {
        showLoader();
        btnRefresh.disabled = true;
        refreshIcon.classList.add('loading');

        try {
            const response = await fetch(`/api/releases?refresh=${forceRefresh}`);
            if (!response.ok) {
                throw new Error(`Server returned status ${response.status}`);
            }
            const data = await response.json();
            
            if (data.success) {
                releasesData = data.entries;
                updateCacheIndicator(data.source);
                renderTimeline();
                showToast(forceRefresh ? "Feed refreshed successfully!" : "Release notes loaded.");
            } else {
                throw new Error(data.error || "Unknown error fetching feed.");
            }
        } catch (error) {
            console.error("Fetch error:", error);
            showError(error.message);
        } finally {
            hideLoader();
            btnRefresh.disabled = false;
            refreshIcon.classList.remove('loading');
        }
    }

    // ==========================================================================
    // RENDERING & INTERFACES
    // ==========================================================================
    function renderTimeline() {
        timelineContainer.innerHTML = '';
        
        let totalCount = 0;
        let featureCount = 0;
        let breakingCount = 0;
        
        let matchesFound = false;

        // Group filters and loop through each date entry
        releasesData.forEach((dayEntry, dayIndex) => {
            const filteredUpdates = dayEntry.updates.filter(update => {
                // Category Filter
                const matchesCategory = activeCategory === 'All' || 
                    (activeCategory === 'Breaking' && (update.type === 'Breaking' || update.type === 'Issue')) ||
                    update.type === activeCategory;
                
                // Search Filter
                const matchesSearch = !searchQuery || 
                    update.text.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    update.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    dayEntry.date.toLowerCase().includes(searchQuery.toLowerCase());
                
                return matchesCategory && matchesSearch;
            });

            // Update running stat totals based on database source (unfiltered calculations for sidebar)
            dayEntry.updates.forEach(update => {
                totalCount++;
                if (update.type === 'Feature') featureCount++;
                if (update.type === 'Breaking' || update.type === 'Issue') breakingCount++;
            });

            if (filteredUpdates.length > 0) {
                matchesFound = true;
                
                // Create a timeline group for this day
                const groupDiv = document.createElement('div');
                groupDiv.className = 'timeline-group';
                
                // Date Header
                const dateHeader = document.createElement('div');
                dateHeader.className = 'timeline-date-header';
                dateHeader.innerHTML = `
                    <div class="timeline-node"></div>
                    <div class="date-badge">${dayEntry.date}</div>
                `;
                groupDiv.appendChild(dateHeader);
                
                // Cards for each update
                filteredUpdates.forEach((update, updateIndex) => {
                    const uniqueId = `up-${dayIndex}-${updateIndex}`;
                    const cardDiv = document.createElement('div');
                    
                    // Style by category class
                    const typeClass = `type-${update.type.toLowerCase()}`;
                    cardDiv.className = `update-card ${typeClass}`;
                    
                    const isChecked = selectedUpdates.has(uniqueId);
                    
                    cardDiv.innerHTML = `
                        <div class="card-header">
                            <span class="badge badge-${update.type.toLowerCase()}">${update.type}</span>
                            <label class="card-select-wrapper">
                                <input type="checkbox" class="card-checkbox" data-id="${uniqueId}" ${isChecked ? 'checked' : ''}>
                                <span class="card-select-label">Select to Tweet</span>
                            </label>
                        </div>
                        <div class="card-body">
                            ${update.html}
                        </div>
                        <div class="card-footer">
                            <button class="card-action-btn btn-copy-link" data-link="${dayEntry.link}">
                                <i class="fa-solid fa-link"></i> Copy Link
                            </button>
                            <button class="card-action-btn btn-tweet-action" data-id="${uniqueId}">
                                <i class="fa-brands fa-x-twitter"></i> Tweet Update
                            </button>
                        </div>
                    `;
                    
                    // Event: Checkbox change
                    const checkbox = cardDiv.querySelector('.card-checkbox');
                    checkbox.addEventListener('change', (e) => {
                        handleSelectionToggle(uniqueId, update, dayEntry, e.target.checked);
                    });

                    // Event: Copy link button
                    const copyBtn = cardDiv.querySelector('.btn-copy-link');
                    copyBtn.addEventListener('click', () => {
                        navigator.clipboard.writeText(dayEntry.link);
                        showToast("Link copied to clipboard!");
                    });

                    // Event: Direct tweet button
                    const tweetBtn = cardDiv.querySelector('.btn-tweet-action');
                    tweetBtn.addEventListener('click', () => {
                        // Select only this item
                        clearAllSelections();
                        checkbox.checked = true;
                        handleSelectionToggle(uniqueId, update, dayEntry, true);
                        showToast("Update loaded into Tweet Composer.");
                    });
                    
                    groupDiv.appendChild(cardDiv);
                });
                
                timelineContainer.appendChild(groupDiv);
            }
        });

        // Update Stats values in sidebar
        statTotal.textContent = totalCount;
        statFeatures.textContent = featureCount;
        statBreaking.textContent = breakingCount;

        // Manage Empty State
        if (!matchesFound) {
            feedEmpty.style.display = 'flex';
        } else {
            feedEmpty.style.display = 'none';
        }
    }

    function updateCacheIndicator(source) {
        cacheIndicator.className = 'pulse-indicator';
        if (source === 'network') {
            cacheIndicator.classList.add('status-network');
            cacheStatusText.textContent = 'Live feed synced';
        } else if (source === 'cache') {
            cacheIndicator.classList.add('status-cache');
            cacheStatusText.textContent = 'Loaded from cache (1h)';
        } else if (source === 'stale_cache') {
            cacheIndicator.classList.add('status-stale');
            cacheStatusText.textContent = 'Network offline (Stale cache)';
        }
    }

    // ==========================================================================
    // SELECTION & TWEET LOGIC
    // ==========================================================================
    function handleSelectionToggle(uniqueId, update, dayEntry, isChecked) {
        if (isChecked) {
            selectedUpdates.set(uniqueId, { update, date: dayEntry.date, link: dayEntry.link });
        } else {
            selectedUpdates.delete(uniqueId);
        }
        
        generateTweetText();
    }

    function clearAllSelections() {
        selectedUpdates.clear();
        document.querySelectorAll('.card-checkbox').forEach(cb => cb.checked = false);
        generateTweetText();
    }

    function generateTweetText() {
        if (selectedUpdates.size === 0) {
            tweetText.value = '';
            charCount.textContent = '0';
            charCount.className = 'char-counter';
            composerStatus.textContent = 'No update selected';
            return;
        }

        let composedText = '';
        
        if (selectedUpdates.size === 1) {
            // Format for a single update
            const [_, item] = selectedUpdates.entries().next().value;
            const cleanText = truncateString(item.update.text, 160);
            composedText = `BigQuery ${item.update.type} (${item.date}):\n\n${cleanText}\n\nRead details: ${item.link}`;
        } else {
            // Format for multiple updates
            composedText = `Latest BigQuery Updates:\n\n`;
            let itemsArray = Array.from(selectedUpdates.values());
            
            itemsArray.forEach(item => {
                const bullet = `• [${item.date}] [${item.update.type}] ${item.update.text}`;
                composedText += truncateString(bullet, 60) + `\n`;
            });
            
            // Add primary link (use link of the first item)
            const firstItem = itemsArray[0];
            composedText += `\nFeed: ${firstItem.link}`;
        }

        // Append hashtags
        if (selectedHashtags.size > 0) {
            composedText += `\n\n${Array.from(selectedHashtags).join(' ')}`;
        }

        tweetText.value = composedText;
        updateCharCount();
        composerStatus.textContent = `${selectedUpdates.size} update(s) selected`;
    }

    function updateCharCount() {
        const length = tweetText.value.length;
        charCount.textContent = length;
        if (length > 280) {
            charCount.classList.add('error');
        } else {
            charCount.classList.remove('error');
        }
    }

    function handleTweetSubmit() {
        const text = tweetText.value.trim();
        if (!text) {
            showToast("Please select an update or compose text first.");
            return;
        }

        if (text.length > 280) {
            showToast("Warning: Tweet exceeds the 280 character limit.");
        }

        // Open Web Intent URL
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(twitterUrl, '_blank');
        showToast("Opening X / Twitter...");
    }

    // Helper: Truncate strings cleanly
    function truncateString(str, num) {
        if (str.length <= num) {
            return str;
        }
        return str.slice(0, num) + '...';
    }

    // ==========================================================================
    // UTILITIES & VIEW STATES
    // ==========================================================================
    function showLoader() {
        feedLoader.style.display = 'flex';
        timelineContainer.style.display = 'none';
        feedError.style.display = 'none';
        feedEmpty.style.display = 'none';
    }

    function hideLoader() {
        feedLoader.style.display = 'none';
        timelineContainer.style.display = 'block';
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        feedError.style.display = 'flex';
        feedLoader.style.display = 'none';
        timelineContainer.style.display = 'none';
        feedEmpty.style.display = 'none';
        showToast("Error fetching updates!");
    }

    function showToast(message) {
        toastText.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // ==========================================================================
    // EVENT LISTENERS
    // ==========================================================================
    function setupEventListeners() {
        // Refresh & Retry
        btnRefresh.addEventListener('click', () => fetchReleases(true));
        btnRetry.addEventListener('click', () => fetchReleases(true));

        // Category Pills Filters
        const filterPills = document.querySelectorAll('.filter-pill');
        filterPills.forEach(pill => {
            pill.addEventListener('click', () => {
                filterPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                activeCategory = pill.getAttribute('data-category');
                renderTimeline();
            });
        });

        // Search Input with Debounce
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            
            if (searchQuery.length > 0) {
                btnClearSearch.style.display = 'block';
            } else {
                btnClearSearch.style.display = 'none';
            }

            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                renderTimeline();
            }, 250);
        });

        // Clear Search
        btnClearSearch.addEventListener('click', () => {
            searchInput.value = '';
            searchQuery = '';
            btnClearSearch.style.display = 'none';
            renderTimeline();
        });

        // Hashtags toggling
        const hashPills = document.querySelectorAll('.hash-pill');
        hashPills.forEach(pill => {
            pill.addEventListener('click', () => {
                const hashtag = pill.getAttribute('data-hashtag');
                if (selectedHashtags.has(hashtag)) {
                    selectedHashtags.delete(hashtag);
                    pill.classList.remove('active');
                } else {
                    selectedHashtags.add(hashtag);
                    pill.classList.add('active');
                }
                generateTweetText();
            });
        });

        // Tweet text typing event
        tweetText.addEventListener('input', updateCharCount);

        // Share/Tweet button submit
        btnSendTweet.addEventListener('click', handleTweetSubmit);
    }
});
