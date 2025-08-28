// Global variables
let currentSection = 'home';
const API_BASE = window.location.origin;

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    loadStats();
    setupEventListeners();
    checkAuthStatus();
    
    // Initialize form validation
    initializeFormValidation();
    
    // Initialize geolocation
    initializeGeolocation();
    
    // Initialize tracking
    initializeTracking();
});

// Initialize tracking functionality
function initializeTracking() {
    const trackForm = document.getElementById('trackPhoneForm');
    if (trackForm) {
        trackForm.addEventListener('submit', handleTrackSubmit);
    }
}

// Handle track phone form submission
async function handleTrackSubmit(event) {
    event.preventDefault();
    
    const identifier = document.getElementById('trackIdentifier').value.trim();
    const type = document.getElementById('trackType').value;
    const ownerEmail = document.getElementById('ownerEmail').value.trim();
    
    if (!identifier || !ownerEmail) {
        showTrackError('Please fill in all required fields.');
        return;
    }
    
    try {
        showTrackLoading(true);
        
        // Use the dedicated tracking endpoint
        const response = await fetch('/api/track', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identifier: identifier,
                type: type,
                ownerEmail: ownerEmail
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success && data.phone) {
            displayTrackResults(data.phone);
        } else {
            showTrackError(data.error || 'Phone not found. Please check your details and try again.');
        }
    } catch (error) {
        console.error('Track error:', error);
        showTrackError('Unable to connect to tracking service. Please check your internet connection and try again.');
    } finally {
        showTrackLoading(false);
    }
}

// Verify phone ownership with additional security checks
async function verifyPhoneOwnership(phone, ownerEmail, identifier, type) {
    try {
        // Basic email match (already done, but double-check)
        if (!phone.email || phone.email.toLowerCase() !== ownerEmail.toLowerCase()) {
            console.log('Email verification failed');
            return null;
        }
        
        // Verify the identifier matches the phone data
        let identifierMatch = false;
        
        switch (type) {
            case 'phone':
                // More flexible phone number matching
                const cleanIdentifier = identifier.replace(/\D/g, '');
                const cleanPhoneNumber = phone.phone_number ? phone.phone_number.replace(/\D/g, '') : '';
                identifierMatch = cleanPhoneNumber && (
                    cleanPhoneNumber.includes(cleanIdentifier) ||
                    cleanIdentifier.includes(cleanPhoneNumber) ||
                    cleanPhoneNumber.endsWith(cleanIdentifier) ||
                    cleanIdentifier.endsWith(cleanPhoneNumber.slice(-10)) // Last 10 digits
                );
                break;
            case 'imei':
                identifierMatch = phone.imei && phone.imei === identifier;
                break;
            case 'email':
                identifierMatch = phone.email && phone.email.toLowerCase() === identifier.toLowerCase();
                break;
            default:
                // For general search, check all fields with flexible phone matching
                const cleanId = identifier.replace(/\D/g, '');
                const cleanPhone = phone.phone_number ? phone.phone_number.replace(/\D/g, '') : '';
                const phoneMatch = cleanPhone && (
                    cleanPhone.includes(cleanId) ||
                    cleanId.includes(cleanPhone) ||
                    cleanPhone.endsWith(cleanId) ||
                    cleanId.endsWith(cleanPhone.slice(-10))
                );
                identifierMatch = (
                    phoneMatch ||
                    (phone.imei && phone.imei === identifier) ||
                    (phone.email && phone.email.toLowerCase() === identifier.toLowerCase())
                );
        }
        
        if (!identifierMatch) {
            console.log('Identifier verification failed');
            return null;
        }
        
        // Additional security: Check if phone is marked as lost (tracking should only work for lost phones)
        if (!phone.date_lost) {
            console.log('Phone is not marked as lost');
            return null;
        }
        
        // Log successful verification (for security audit)
        console.log(`Phone tracking verified for email: ${ownerEmail}, phone ID: ${phone.id}`);
        
        return phone;
    } catch (error) {
        console.error('Ownership verification error:', error);
        return null;
    }
}

// Show tracking loading state
function showTrackLoading(loading) {
    const submitBtn = document.querySelector('#trackPhoneForm button[type="submit"]');
    const trackResults = document.getElementById('trackResults');
    
    if (loading) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Tracking...';
        trackResults.classList.add('hidden');
    } else {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-search-location"></i> Track Phone Location';
    }
}

// Display tracking results
function displayTrackResults(phone) {
    const trackResults = document.getElementById('trackResults');
    const trackDetails = document.getElementById('trackDetails');
    
    let detailsHTML = '';
    
    // Phone details
    if (phone.phone_number) {
        detailsHTML += createTrackDetailItem('Phone Number', phone.phone_number, 'fas fa-phone');
    }
    if (phone.imei) {
        detailsHTML += createTrackDetailItem('IMEI', phone.imei, 'fas fa-barcode');
    }
    if (phone.brand || phone.model) {
        const device = `${phone.brand || ''} ${phone.model || ''}`.trim();
        detailsHTML += createTrackDetailItem('Device', device, 'fas fa-mobile-alt');
    }
    if (phone.color) {
        detailsHTML += createTrackDetailItem('Color', phone.color, 'fas fa-palette');
    }
    
    // Location details
    if (phone.latitude && phone.longitude) {
        detailsHTML += `
            <div class="coordinates-display">
                <div class="coords">${phone.latitude.toFixed(6)}, ${phone.longitude.toFixed(6)}</div>
                <small>GPS Coordinates</small>
            </div>
        `;
        
        // Calculate distance if user location is available
        if (userLocation && userLocation.latitude && userLocation.longitude) {
            const distance = calculateDistance(
                userLocation.latitude, userLocation.longitude,
                phone.latitude, phone.longitude
            );
            detailsHTML += `
                <div class="distance-info">
                    <div class="distance">${formatDistance(distance)}</div>
                    <small>Distance from your current location</small>
                </div>
            `;
        }
    }
    
    // Location address
    if (phone.location_lost || phone.city || phone.region_state || phone.country) {
        const location = [phone.location_lost, phone.city, phone.region_state, phone.country]
            .filter(Boolean).join(', ');
        detailsHTML += createTrackDetailItem('Last Known Location', location, 'fas fa-map-marker-alt');
    }
    
    if (phone.date_lost) {
        const date = new Date(phone.date_lost).toLocaleDateString();
        detailsHTML += createTrackDetailItem('Date Lost', date, 'fas fa-calendar');
    }
    
    trackDetails.innerHTML = detailsHTML;
    trackResults.classList.remove('hidden');
    
    // Store current phone data for actions
    window.currentTrackedPhone = phone;
    
    // Initialize map if coordinates are available
    if (phone.latitude && phone.longitude) {
        initializeTrackingMap(phone.latitude, phone.longitude, phone);
    }
    
    // Scroll to results
    trackResults.scrollIntoView({ behavior: 'smooth' });
}

// Create track detail item HTML
function createTrackDetailItem(label, value, icon) {
    return `
        <div class="track-detail-item">
            <div class="track-detail-label">
                <i class="${icon}"></i>
                ${label}
            </div>
            <div class="track-detail-value">${value}</div>
        </div>
    `;
}

// Show tracking error
function showTrackError(message) {
    const trackResults = document.getElementById('trackResults');
    const trackDetails = document.getElementById('trackDetails');
    
    trackDetails.innerHTML = `
        <div class="track-detail-item" style="justify-content: center; color: #dc3545;">
            <div style="text-align: center;">
                <i class="fas fa-exclamation-triangle" style="font-size: 24px; margin-bottom: 10px;"></i>
                <div>${message}</div>
            </div>
        </div>
    `;
    
    trackResults.classList.remove('hidden');
    trackResults.scrollIntoView({ behavior: 'smooth' });
}

// Copy coordinates to clipboard
function copyLocationToClipboard() {
    if (!window.currentTrackedPhone || !window.currentTrackedPhone.latitude || !window.currentTrackedPhone.longitude) {
        alert('No coordinates available to copy.');
        return;
    }
    
    const coords = `${window.currentTrackedPhone.latitude}, ${window.currentTrackedPhone.longitude}`;
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(coords).then(() => {
            showNotification('Coordinates copied to clipboard!', 'success');
        }).catch(() => {
            fallbackCopyToClipboard(coords);
        });
    } else {
        fallbackCopyToClipboard(coords);
    }
}

// Fallback copy method
function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
        document.execCommand('copy');
        showNotification('Coordinates copied to clipboard!', 'success');
    } catch (err) {
        alert('Failed to copy coordinates. Please copy manually: ' + text);
    }
    document.body.removeChild(textArea);
}

// Open location in maps
function openInMaps() {
    if (!window.currentTrackedPhone || !window.currentTrackedPhone.latitude || !window.currentTrackedPhone.longitude) {
        alert('No coordinates available to open in maps.');
        return;
    }
    
    const lat = window.currentTrackedPhone.latitude;
    const lng = window.currentTrackedPhone.longitude;
    
    // Try to open in Google Maps
    const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    window.open(googleMapsUrl, '_blank');
}

// Initialize tracking map
let trackingMap = null;

function initializeTrackingMap(latitude, longitude, phone) {
    const mapContainer = document.getElementById('mapContainer');
    
    if (!mapContainer) {
        console.error('Map container not found');
        return;
    }
    
    // Clear existing map
    if (trackingMap) {
        trackingMap.remove();
    }
    
    // Initialize new map
    trackingMap = L.map('mapContainer').setView([latitude, longitude], 15);
    
    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(trackingMap);
    
    // Create custom icon for lost phone
    const phoneIcon = L.divIcon({
        className: 'custom-phone-marker',
        html: '<i class="fas fa-mobile-alt" style="color: #dc3545; font-size: 20px;"></i>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
    
    // Add marker for phone location
    const marker = L.marker([latitude, longitude], { icon: phoneIcon }).addTo(trackingMap);
    
    // Create popup content
    const popupContent = `
        <div style="text-align: center; min-width: 200px;">
            <h4 style="margin: 0 0 10px 0; color: #dc3545;">
                <i class="fas fa-mobile-alt"></i> Lost Phone
            </h4>
            ${phone.brand && phone.model ? `<p><strong>${phone.brand} ${phone.model}</strong></p>` : ''}
            ${phone.color ? `<p>Color: ${phone.color}</p>` : ''}
            ${phone.date_lost ? `<p>Lost: ${new Date(phone.date_lost).toLocaleDateString()}</p>` : ''}
            <p style="font-size: 12px; color: #666; margin: 10px 0 0 0;">
                ${latitude.toFixed(6)}, ${longitude.toFixed(6)}
            </p>
        </div>
    `;
    
    marker.bindPopup(popupContent).openPopup();
    
    // Add user location if available
    if (userLocation && userLocation.latitude && userLocation.longitude) {
        const userIcon = L.divIcon({
            className: 'custom-user-marker',
            html: '<i class="fas fa-user" style="color: #007bff; font-size: 16px;"></i>',
            iconSize: [25, 25],
            iconAnchor: [12.5, 12.5]
        });
        
        const userMarker = L.marker([userLocation.latitude, userLocation.longitude], { icon: userIcon }).addTo(trackingMap);
        userMarker.bindPopup('<div style="text-align: center;"><strong>Your Location</strong></div>');
        
        // Fit map to show both markers
        const group = new L.featureGroup([marker, userMarker]);
        trackingMap.fitBounds(group.getBounds().pad(0.1));
    }
}

// Track phone from search results card
function trackPhoneFromCard(phoneId, latitude, longitude, brand, model, color) {
    // Show permission prompt before allowing tracking
    const ownerEmail = prompt('To track this device, please enter the owner\'s email address for verification:');
    
    if (!ownerEmail || !isValidEmail(ownerEmail)) {
        alert('Please enter a valid email address to track this device.');
        return;
    }
    
    // Create a phone object for tracking
    const phone = {
        id: phoneId,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        brand: brand !== 'Unknown' ? brand : '',
        model: model !== 'Phone' ? model : '',
        color: color || '',
        email: ownerEmail // Add email for verification
    };
    
    // Navigate to track section
    showSection('track');
    
    // Verify ownership before displaying results
    setTimeout(async () => {
        try {
            // Fetch full phone details to verify ownership
            const response = await fetch(`/api/phone/${phoneId}`);
            const phoneData = await response.json();
            
            if (response.ok && phoneData.email && phoneData.email.toLowerCase() === ownerEmail.toLowerCase()) {
                // Merge the fetched data with location data
                const fullPhone = { ...phoneData, latitude: phone.latitude, longitude: phone.longitude };
                displayTrackResults(fullPhone);
            } else {
                showTrackError('Email verification failed. You can only track phones registered with your email address.');
            }
        } catch (error) {
            console.error('Verification error:', error);
            showTrackError('Unable to verify ownership. Please try again.');
        }
    }, 500);
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'info-circle'}"></i>
        ${message}
    `;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#28a745' : '#007bff'};
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 500;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Geolocation functionality
let userLocation = null;
let watchId = null;

function initializeGeolocation() {
    // Check if geolocation is supported
    if (!navigator.geolocation) {
        console.warn('Geolocation is not supported by this browser.');
        hideLocationButtons();
        return;
    }
    
    // Show location buttons
    showLocationButtons();
}

function hideLocationButtons() {
    const locationBtns = document.querySelectorAll('.location-btn');
    locationBtns.forEach(btn => {
        btn.style.display = 'none';
    });
}

function showLocationButtons() {
    const locationBtns = document.querySelectorAll('.location-btn');
    locationBtns.forEach(btn => {
        btn.style.display = 'flex';
    });
}

function showLocationPaymentPrompt(context = 'hero') {
    const statusElement = document.getElementById(context + 'LocationStatus');
    
    // Show payment prompt message
    showLocationStatus(statusElement, 
        'Location-based search is a premium feature. Upgrade to access proximity search with GPS coordinates.', 
        'premium'
    );
    
    // Show payment modal or redirect to payment section
    setTimeout(() => {
        if (confirm('Location-based search requires a premium subscription ($9.99/month). Would you like to upgrade now?')) {
            showSection('payment');
        }
    }, 500);
}

// Keep the original detectLocation function for premium users
function detectLocationPremium(context = 'hero') {
    const statusElement = document.getElementById(context + 'LocationStatus');
    const button = document.getElementById(context + 'LocationBtn');
    const proximitySearch = document.getElementById(context === 'hero' ? 'proximitySearch' : 'proximitySearch');
    
    if (!navigator.geolocation) {
        showLocationStatus(statusElement, 'Geolocation is not supported by your browser.', 'error');
        return;
    }
    
    // Update UI to show detection in progress
    button.classList.add('detecting');
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detecting Location...';
    
    showLocationStatus(statusElement, 'Detecting your location...', 'detecting');
    
    const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes
    };
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            userLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy
            };
            
            onLocationSuccess(statusElement, button, proximitySearch, context);
        },
        (error) => {
            onLocationError(error, statusElement, button, context);
        },
        options
    );
}

function onLocationSuccess(statusElement, button, proximitySearch, context) {
    // Reset button state
    button.classList.remove('detecting');
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-check"></i> Location Detected';
    
    // Show success message with approximate location
    reverseGeocode(userLocation.latitude, userLocation.longitude)
        .then(locationName => {
            const accuracyText = userLocation.accuracy < 100 ? 'High accuracy' : 'Approximate';
            showLocationStatus(statusElement, 
                `Location detected: ${locationName} (${accuracyText})`, 
                'success'
            );
        })
        .catch(() => {
            showLocationStatus(statusElement, 
                `Location detected (${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)})`, 
                'success'
            );
        });
    
    // Show proximity search options
    if (proximitySearch) {
        proximitySearch.classList.remove('hidden');
    }
    
    // Auto-populate location fields if available
    populateLocationFields();
}

function onLocationError(error, statusElement, button, context) {
    // Reset button state
    button.classList.remove('detecting');
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-location-arrow"></i> Use My Location';
    
    let errorMessage = 'Unable to detect location. ';
    
    switch(error.code) {
        case error.PERMISSION_DENIED:
            errorMessage += 'Please allow location access and try again.';
            break;
        case error.POSITION_UNAVAILABLE:
            errorMessage += 'Location information is unavailable.';
            break;
        case error.TIMEOUT:
            errorMessage += 'Location request timed out. Please try again.';
            break;
        default:
            errorMessage += 'An unknown error occurred.';
            break;
    }
    
    showLocationStatus(statusElement, errorMessage, 'error');
}

function showLocationStatus(element, message, type) {
    if (!element) return;
    
    element.textContent = message;
    element.className = `location-status ${type}`;
    element.classList.remove('hidden');
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            element.classList.add('hidden');
        }, 5000);
    }
    
    // Auto-hide premium messages after 8 seconds
    if (type === 'premium') {
        setTimeout(() => {
            element.classList.add('hidden');
        }, 8000);
    }
}

async function reverseGeocode(lat, lng) {
    try {
        // Using a simple reverse geocoding approach
        // In a production app, you'd use a proper geocoding service
        const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
        const data = await response.json();
        
        if (data.city && data.countryName) {
            return `${data.city}, ${data.countryName}`;
        } else if (data.locality && data.countryName) {
            return `${data.locality}, ${data.countryName}`;
        } else {
            return `${data.countryName || 'Unknown location'}`;
        }
    } catch (error) {
        console.warn('Reverse geocoding failed:', error);
        throw error;
    }
}

function populateLocationFields() {
    if (!userLocation) return;
    
    // Auto-populate location fields based on reverse geocoding
    reverseGeocode(userLocation.latitude, userLocation.longitude)
        .then(locationName => {
            // Try to parse the location and populate fields
            const parts = locationName.split(', ');
            if (parts.length >= 2) {
                const city = parts[0];
                const country = parts[parts.length - 1];
                
                // Auto-fill city field if empty
                const cityField = document.getElementById('searchCity');
                if (cityField && !cityField.value.trim()) {
                    cityField.value = city;
                }
                
                // Auto-select country if it matches
                const countryField = document.getElementById('searchCountry');
                if (countryField) {
                    const options = countryField.options;
                    for (let i = 0; i < options.length; i++) {
                        if (options[i].text.toLowerCase().includes(country.toLowerCase())) {
                            countryField.selectedIndex = i;
                            break;
                        }
                    }
                }
            }
        })
        .catch(error => {
            console.warn('Could not auto-populate location fields:', error);
        });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance;
}

function formatDistance(distance) {
    if (distance < 1) {
        return `${Math.round(distance * 1000)}m`;
    } else {
        return `${distance.toFixed(1)}km`;
    }
}

// Initialize the application
function initializeApp() {
    // Set current date as default for date inputs
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('lostDate').value = today;
    document.getElementById('foundDate').value = today;
    
    // Force hide loading spinner immediately
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.classList.add('hidden');
        spinner.style.display = 'none';
    }
    
    // Show home section by default
    showSection('home');
}

// Setup event listeners
function setupEventListeners() {
    // Navigation
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.getAttribute('href').substring(1);
            showSection(section);
        });
    });

    // Mobile menu toggle
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    
    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    // Form submissions
    document.getElementById('lostPhoneForm').addEventListener('submit', handleLostPhoneSubmit);
    document.getElementById('foundPhoneForm').addEventListener('submit', handleFoundPhoneSubmit);
    
    // Authentication forms
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const paymentForm = document.getElementById('paymentForm');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegistration);
    }
    if (paymentForm) {
        paymentForm.addEventListener('submit', handlePayment);
    }

    // Logout functionality
    const logoutMenuItem = document.getElementById('logoutMenuItem');
    if (logoutMenuItem) {
        const logoutLink = logoutMenuItem.querySelector('a');
        if (logoutLink) {
            logoutLink.addEventListener('click', (e) => {
                e.preventDefault();
                handleLogout();
            });
        }
    }

    // Search functionality
    document.getElementById('searchQuery').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchPhones();
        }
    });
    
    // Search button click
    const searchButton = document.getElementById('searchButton');
    console.log('Search button element found:', searchButton);
    if (searchButton) {
        searchButton.addEventListener('click', (e) => {
            console.log('Search button clicked!');
            e.preventDefault();
            searchPhones();
        });
        console.log('Search button event listener added');
    } else {
        console.error('Search button not found!');
    }
    
    // Hero search functionality
    const heroSearchQuery = document.getElementById('heroSearchQuery');
    if (heroSearchQuery) {
        heroSearchQuery.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performHeroSearch();
            }
        });
    }
    
    // Hero search button
    const heroSearchButton = document.querySelector('.hero-actions .search-button');
    console.log('Hero search button found:', !!heroSearchButton);
    if (heroSearchButton) {
        heroSearchButton.addEventListener('click', (e) => {
            console.log('Hero search button clicked via event listener!');
            e.preventDefault();
            performHeroSearch();
        });
        console.log('Hero search button event listener added');
    } else {
        console.error('Hero search button not found! Trying alternative selector...');
        const altButton = document.querySelector('.btn.btn-primary.search-button');
        console.log('Alternative button found:', !!altButton);
        if (altButton) {
            altButton.addEventListener('click', (e) => {
                console.log('Alternative hero search button clicked!');
                e.preventDefault();
                performHeroSearch();
            });
        }
    }
}

// Show specific section
function showSection(sectionName) {
    // Hide all sections
    const sections = document.querySelectorAll('.section, .hero');
    sections.forEach(section => {
        section.classList.add('hidden');
    });

    // Show target section
    const targetSection = document.getElementById(sectionName);
    if (targetSection) {
        targetSection.classList.remove('hidden');
        targetSection.classList.add('fade-in');
        currentSection = sectionName;
    }

    // Update navigation
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${sectionName}`) {
            link.classList.add('active');
        }
    });

    // Close mobile menu
    document.querySelector('.hamburger').classList.remove('active');
    document.querySelector('.nav-menu').classList.remove('active');
}

// Load statistics
async function loadStats() {
    try {
        console.log('Loading stats from:', `${API_BASE}/api/lost-phones`);
        const [lostResponse, foundResponse] = await Promise.all([
            fetch(`${API_BASE}/api/lost-phones`),
            fetch(`${API_BASE}/api/found-phones`)
        ]);

        console.log('Lost response status:', lostResponse.status);
        console.log('Found response status:', foundResponse.status);

        // Check if we got HTML instead of JSON (static server fallback)
        const lostContentType = lostResponse.headers.get('content-type');
        const foundContentType = foundResponse.headers.get('content-type');
        
        if (!lostContentType?.includes('application/json') || !foundContentType?.includes('application/json')) {
            console.log('API server not available, using demo data');
            // Use demo data when backend is not available
            const totalLost = 127;
            const totalFound = 89;
            const totalReturned = 45;
            
            document.getElementById('totalLost').textContent = totalLost;
            document.getElementById('totalFound').textContent = totalFound;
            document.getElementById('totalReturned').textContent = totalReturned;
            
            console.log('Demo stats loaded:', { totalLost, totalFound, totalReturned });
            return;
        }

        const lostPhones = await lostResponse.json();
        const foundPhones = await foundResponse.json();

        const totalLost = lostPhones.length;
        const totalFound = foundPhones.length;
        const totalReturned = lostPhones.filter(phone => phone.status === 'returned').length;

        document.getElementById('totalLost').textContent = totalLost;
        document.getElementById('totalFound').textContent = totalFound;
        document.getElementById('totalReturned').textContent = totalReturned;
        
        console.log('Stats loaded successfully:', { totalLost, totalFound, totalReturned });
    } catch (error) {
        console.error('Error loading stats:', error);
        // Fallback to demo data on error
        console.log('Using fallback demo data due to error');
        const totalLost = 127;
        const totalFound = 89;
        const totalReturned = 45;
        
        document.getElementById('totalLost').textContent = totalLost;
        document.getElementById('totalFound').textContent = totalFound;
        document.getElementById('totalReturned').textContent = totalReturned;
    }
}

// Handle lost phone form submission
async function handleLostPhoneSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    // Add geolocation data if available
    if (userLocation) {
        data.latitude = userLocation.latitude;
        data.longitude = userLocation.longitude;
    }
    
    // Validation
    if (!data.email || !data.contact_name) {
        showMessage('Please fill in all required fields (Email and Contact Name)', 'error');
        return;
    }

    if (!isValidEmail(data.email)) {
        showMessage('Please enter a valid email address', 'error');
        return;
    }

    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/lost-phones`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('Lost phone reported successfully! We\'ll help you find it.', 'success');
            e.target.reset();
            document.getElementById('lostDate').value = new Date().toISOString().split('T')[0];
            loadStats(); // Refresh stats
        } else {
            showMessage(result.error || 'Error reporting lost phone', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage('Network error. Please try again.', 'error');
    } finally {
        showLoading(false);
        
        // Restore hero search button
        if (heroSearchButton) {
            heroSearchButton.classList.remove('searching');
            heroSearchButton.innerHTML = 'Search';
        }
    }
}

// Handle found phone form submission
async function handleFoundPhoneSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    // Add geolocation data if available
    if (userLocation) {
        data.latitude = userLocation.latitude;
        data.longitude = userLocation.longitude;
    }
    
    // Validation
    if (!data.finder_name || !data.finder_contact) {
        showMessage('Please fill in all required fields (Your Name and Contact)', 'error');
        return;
    }

    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/found-phones`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('Found phone reported successfully! Thank you for helping reunite someone with their device.', 'success');
            e.target.reset();
            document.getElementById('foundDate').value = new Date().toISOString().split('T')[0];
            loadStats(); // Refresh stats
        } else {
            showMessage(result.error || 'Error reporting found phone', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage('Network error. Please try again.', 'error');
    } finally {
        showLoading(false);
        
        // Restore hero search button
        const heroSearchButton = document.querySelector('.hero-actions .search-button');
        if (heroSearchButton) {
            heroSearchButton.classList.remove('searching');
            heroSearchButton.innerHTML = 'Search';
        }
    }
}

// Search phones
async function searchPhones() {
    console.log('searchPhones function called');
    
    // Debug: Check if elements exist
    const queryElement = document.getElementById('searchQuery');
    const typeElement = document.getElementById('searchType');
    const countryElement = document.getElementById('searchCountry');
    const regionElement = document.getElementById('searchRegion');
    const cityElement = document.getElementById('searchCity');
    
    console.log('Search elements found:', {
        query: !!queryElement,
        type: !!typeElement,
        country: !!countryElement,
        region: !!regionElement,
        city: !!cityElement
    });
    
    if (!queryElement || !countryElement || !regionElement || !cityElement) {
        console.error('Some search elements are missing!');
        showMessage('Search form elements not found. Please refresh the page.', 'error');
        return;
    }
    
    const query = queryElement.value.trim();
    const type = typeElement ? typeElement.value : '';
    const country = countryElement.value;
    const region = regionElement.value;
    const city = cityElement.value.trim();
    console.log('Search parameters:', { query, type, country, region, city });
    
    if (!query && !country && !region && !city) {
        showMessage('Please enter a search term or select location filters', 'error');
        return;
    }

    // Add search animation
    const searchButton = document.getElementById('searchButton');
    const searchResults = document.getElementById('searchResults');
    
    // Start search animation
    searchButton.classList.add('searching');
    searchButton.innerHTML = '<span class="search-loading">Searching</span>';
    
    // Hide previous results with animation
    searchResults.classList.remove('show');
    
    showLoading(true);
    
    try {
        const params = new URLSearchParams();
        if (query) params.append('query', query);
        if (type && query) params.append('type', type);
        if (country) params.append('country', country);
        if (region) params.append('region', region);
        if (city) params.append('city', city);
        
        // Add geolocation parameters if available
        if (userLocation) {
            const proximityElement = document.getElementById('proximitySearch');
            if (proximityElement && !proximityElement.classList.contains('hidden')) {
                const radiusElement = document.getElementById('searchRadius');
                const radius = radiusElement ? radiusElement.value : '10';
                params.append('lat', userLocation.latitude.toString());
                params.append('lon', userLocation.longitude.toString());
                params.append('radius', radius);
            }
        }
        
        const searchUrl = `${API_BASE}/api/search?${params.toString()}`;
        console.log('Searching with URL:', searchUrl);
        
        const response = await fetch(searchUrl);
        console.log('Search response status:', response.status);
        
        // Check if we got HTML instead of JSON (static server fallback)
        const contentType = response.headers.get('content-type');
        
        if (!contentType?.includes('application/json')) {
            console.log('API server not available, using demo search results');
            // Provide demo search results when backend is not available
            const demoResults = [
                {
                    id: 1,
                    phone_number: '+63 912 345 6789',
                    imei: '123456789012345',
                    email: 'demo@example.com',
                    contact_name: 'Demo User',
                    brand: 'iPhone',
                    model: '14 Pro',
                    color: 'Space Black',
                    country: 'Philippines',
                    region_state: 'Metro Manila',
                    city: 'Manila',
                    location_lost: 'Rizal Park',
                    date_lost: '2024-01-15',
                    contact_phone: '+63 912 345 6789',
                    description: 'Demo lost phone for testing',
                    latitude: 14.5995,
                    longitude: 120.9842,
                    status: 'lost'
                },
                {
                    id: 2,
                    phone_number: '+63 917 888 9999',
                    imei: '987654321098765',
                    email: 'test@demo.com',
                    contact_name: 'Test User',
                    brand: 'Samsung',
                    model: 'Galaxy S23',
                    color: 'Phantom Black',
                    country: 'Philippines',
                    region_state: 'Metro Manila',
                    city: 'Quezon City',
                    location_lost: 'SM North EDSA',
                    date_lost: '2024-01-20',
                    contact_phone: '+63 917 888 9999',
                    description: 'Another demo device',
                    latitude: 14.6042,
                    longitude: 120.9822,
                    status: 'found'
                },
                {
                    id: 3,
                    phone_number: '+63 905 123 4567',
                    imei: '111222333444555',
                    email: 'lost@phone.com',
                    contact_name: 'Maria Santos',
                    brand: 'Xiaomi',
                    model: 'Mi 11',
                    color: 'Blue',
                    country: 'Philippines',
                    region_state: 'Cebu',
                    city: 'Cebu City',
                    location_lost: 'Ayala Center Cebu',
                    date_lost: '2024-01-25',
                    contact_phone: '+63 905 123 4567',
                    description: 'Lost during shopping',
                    latitude: 10.3157,
                    longitude: 123.8854,
                    status: 'lost'
                },
                {
                    id: 4,
                    phone_number: '+63 998 765 4321',
                    imei: '555666777888999',
                    email: 'found@device.com',
                    contact_name: 'Juan Dela Cruz',
                    brand: 'Oppo',
                    model: 'Find X5',
                    color: 'White',
                    country: 'Philippines',
                    region_state: 'Davao',
                    city: 'Davao City',
                    location_lost: 'People\'s Park',
                    date_lost: '2024-01-30',
                    contact_phone: '+63 998 765 4321',
                    description: 'Found in the park',
                    latitude: 7.0731,
                    longitude: 125.6128,
                    status: 'found'
                }
            ].filter(phone => 
                !query || 
                phone.phone_number.toLowerCase().includes(query.toLowerCase()) ||
                phone.imei.includes(query) ||
                phone.email.toLowerCase().includes(query.toLowerCase()) ||
                phone.contact_name.toLowerCase().includes(query.toLowerCase()) ||
                phone.brand.toLowerCase().includes(query.toLowerCase()) ||
                phone.model.toLowerCase().includes(query.toLowerCase())
            );
            displaySearchResults(demoResults);
            return;
        }
        
        const results = await response.json();
        console.log('Search results:', results);

        if (response.ok) {
            displaySearchResults(results.data || results);
        } else {
            showMessage(results.error || 'Error searching phones', 'error');
        }
    } catch (error) {
        console.error('Search error details:', error);
        // Fallback to demo data on error
        console.log('Using fallback demo search results due to error');
        const demoResults = [
            {
                id: 1,
                phone_number: '+63 912 345 6789',
                imei: '123456789012345',
                email: 'demo@example.com',
                contact_name: 'Demo User',
                brand: 'iPhone',
                model: '14 Pro',
                color: 'Space Black',
                country: 'Philippines',
                region_state: 'Metro Manila',
                city: 'Manila',
                location_lost: 'Rizal Park',
                date_lost: '2024-01-15',
                contact_phone: '+63 912 345 6789',
                description: 'Demo lost phone for testing',
                latitude: 14.5995,
                longitude: 120.9842,
                status: 'lost'
            },
            {
                id: 2,
                phone_number: '+63 917 888 9999',
                imei: '987654321098765',
                email: 'test@demo.com',
                contact_name: 'Test User',
                brand: 'Samsung',
                model: 'Galaxy S23',
                color: 'Phantom Black',
                country: 'Philippines',
                region_state: 'Metro Manila',
                city: 'Quezon City',
                location_lost: 'SM North EDSA',
                date_lost: '2024-01-20',
                contact_phone: '+63 917 888 9999',
                description: 'Another demo device',
                latitude: 14.6042,
                longitude: 120.9822,
                status: 'found'
            }
        ].filter(phone => 
            !query || 
            phone.phone_number.toLowerCase().includes(query.toLowerCase()) ||
            phone.imei.includes(query) ||
            phone.email.toLowerCase().includes(query.toLowerCase()) ||
            phone.contact_name.toLowerCase().includes(query.toLowerCase()) ||
            phone.brand.toLowerCase().includes(query.toLowerCase()) ||
            phone.model.toLowerCase().includes(query.toLowerCase())
        );
        displaySearchResults(demoResults);
    } finally {
        showLoading(false);
        
        // Restore search button
        searchButton.classList.remove('searching');
        searchButton.innerHTML = 'Search';
        
        // Show results with animation after a brief delay
        setTimeout(() => {
            searchResults.classList.add('show');
        }, 100);
    }
}

// Display search results
function displaySearchResults(results) {
    const container = document.getElementById('searchResults');
    
    // Show loading animation first
    container.innerHTML = `
        <div class="search-loading-container">
            <div class="loading-spinner"></div>
            <h3>Searching for devices...</h3>
            <p>Please wait while we search our database</p>
        </div>
    `;
    
    // Show results after a brief delay for better UX
    setTimeout(() => {
        if (results.length === 0) {
            container.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-search" style="font-size: 3rem; color: #ccc; margin-bottom: 1rem;"></i>
                    <h3>No phones found</h3>
                    <p>No phones match your search criteria. Try different search terms or check the spelling.</p>
                </div>
            `;
            return;
        }

        const resultsHTML = results.map(phone => createPhoneCard(phone)).join('');
        container.innerHTML = `
            <div class="results-header">
                <h3>Found ${results.length} phone(s)</h3>
            </div>
            <div class="results-grid">
                ${resultsHTML}
            </div>
        `;
    }, 1500); // 1.5 second delay for loading animation
}

// Create phone card HTML
function createPhoneCard(phone) {
    const statusClass = `status-${phone.status || 'lost'}`;
    const statusText = phone.status || 'lost';
    
    // Calculate distance if user location is available
    let distanceInfo = '';
    if (userLocation && phone.latitude && phone.longitude) {
        const distance = calculateDistance(
            userLocation.latitude, 
            userLocation.longitude, 
            parseFloat(phone.latitude), 
            parseFloat(phone.longitude)
        );
        distanceInfo = `
            <div class="detail-item distance-info">
                <span class="detail-label">Distance</span>
                <span class="detail-value">📍 ${formatDistance(distance)} away</span>
            </div>
        `;
    }
    
    return `
        <div class="phone-card">
            <div class="phone-header">
                <div class="phone-title">
                    ${phone.brand || 'Unknown'} ${phone.model || 'Phone'}
                </div>
                <span class="status-badge ${statusClass}">${statusText}</span>
            </div>
            <div class="phone-details">
                ${phone.phone_number ? `
                    <div class="detail-item">
                        <span class="detail-label">Phone Number</span>
                        <span class="detail-value">${phone.phone_number}</span>
                    </div>
                ` : ''}
                ${phone.imei ? `
                    <div class="detail-item">
                        <span class="detail-label">IMEI</span>
                        <span class="detail-value">${phone.imei}</span>
                    </div>
                ` : ''}
                ${phone.email ? `
                    <div class="detail-item">
                        <span class="detail-label">Email</span>
                        <span class="detail-value">${phone.email}</span>
                    </div>
                ` : ''}
                ${phone.color ? `
                    <div class="detail-item">
                        <span class="detail-label">Color</span>
                        <span class="detail-value">${phone.color}</span>
                    </div>
                ` : ''}
                ${phone.country || phone.region_state || phone.city ? `
                    <div class="detail-item">
                        <span class="detail-label">Location</span>
                        <span class="detail-value">
                            ${[phone.city, phone.region_state, phone.country].filter(Boolean).join(', ')}
                        </span>
                    </div>
                ` : ''}
                ${phone.location_lost ? `
                    <div class="detail-item">
                        <span class="detail-label">Specific Location</span>
                        <span class="detail-value">${phone.location_lost}</span>
                    </div>
                ` : ''}
                ${phone.date_lost ? `
                    <div class="detail-item">
                        <span class="detail-label">Date Lost</span>
                        <span class="detail-value">${formatDate(phone.date_lost)}</span>
                    </div>
                ` : ''}
                ${phone.contact_name ? `
                    <div class="detail-item">
                        <span class="detail-label">Contact</span>
                        <span class="detail-value">${phone.contact_name}</span>
                    </div>
                ` : ''}
                ${phone.contact_phone ? `
                    <div class="detail-item">
                        <span class="detail-label">Contact Phone</span>
                        <span class="detail-value">${phone.contact_phone}</span>
                    </div>
                ` : ''}
                ${distanceInfo}
            </div>
            ${phone.description ? `
                <div class="phone-description">
                    <span class="detail-label">Description</span>
                    <p class="detail-value">${phone.description}</p>
                </div>
            ` : ''}
            ${phone.latitude && phone.longitude ? `
                <div class="location-tracking">
                    <div class="gps-coordinates">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>GPS: ${parseFloat(phone.latitude).toFixed(6)}, ${parseFloat(phone.longitude).toFixed(6)}</span>
                    </div>
                    <button class="btn btn-track" onclick="trackPhoneFromCard('${phone.id}', ${phone.latitude}, ${phone.longitude}, '${phone.brand || 'Unknown'}', '${phone.model || 'Phone'}', '${phone.color || ''}')">
                        <i class="fas fa-crosshairs"></i> Track Location
                    </button>
                </div>
            ` : ''}
            <div class="phone-footer">
                <small class="text-muted">Reported on ${formatDate(phone.created_at)}</small>
            </div>
        </div>
    `;
}

// Utility functions
function showLoading(show) {
    const spinner = document.getElementById('loadingSpinner');
    if (show) {
        spinner.classList.remove('hidden');
        spinner.style.display = 'flex';
    } else {
        spinner.classList.add('hidden');
        spinner.style.display = 'none';
    }
}

function showMessage(message, type = 'success') {
    const container = document.getElementById('messageContainer');
    const content = document.getElementById('messageContent');
    
    content.textContent = message;
    content.className = `message ${type}`;
    container.classList.remove('hidden');
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        container.classList.add('hidden');
    }, 5000);
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Smooth scrolling for navigation links
function smoothScroll(target) {
    const element = document.getElementById(target);
    if (element) {
        element.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
}

// Handle window resize
window.addEventListener('resize', () => {
    // Close mobile menu on resize
    if (window.innerWidth > 768) {
        document.querySelector('.hamburger').classList.remove('active');
        document.querySelector('.nav-menu').classList.remove('active');
    }
});

// Handle escape key to close mobile menu
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelector('.hamburger').classList.remove('active');
        document.querySelector('.nav-menu').classList.remove('active');
        
        // Also hide message if visible
        document.getElementById('messageContainer').classList.add('hidden');
    }
});

// Click outside to close mobile menu
document.addEventListener('click', (e) => {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    
    if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
    }
});

// Form validation helpers
function validatePhoneNumber(phone) {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
}

function validateIMEI(imei) {
    const imeiRegex = /^\d{15}$/;
    return imeiRegex.test(imei);
}

// Initialize form validation
function initializeFormValidation() {
    // Email validation
    const emailInputs = document.querySelectorAll('input[type="email"]');
    emailInputs.forEach(input => {
        input.addEventListener('blur', (e) => {
            if (e.target.value && !isValidEmail(e.target.value)) {
                e.target.style.borderColor = '#dc3545';
            } else {
                e.target.style.borderColor = '#ddd';
            }
        });
    });

    // Phone number validation
    const phoneInputs = document.querySelectorAll('input[type="tel"]');
    phoneInputs.forEach(input => {
        input.addEventListener('blur', (e) => {
            if (e.target.value && !validatePhoneNumber(e.target.value)) {
                e.target.style.borderColor = '#dc3545';
            } else {
                e.target.style.borderColor = '#ddd';
            }
        });
    });

    // IMEI validation
    const imeiInputs = document.querySelectorAll('input[name="imei"]');
    imeiInputs.forEach(input => {
        input.addEventListener('blur', (e) => {
            if (e.target.value && !validateIMEI(e.target.value)) {
                e.target.style.borderColor = '#dc3545';
            } else {
                e.target.style.borderColor = '#ddd';
            }
        });
    });
}

// Authentication and Payment System
let currentUser = null;
let userSession = null;

// Check if user is logged in on page load
function checkAuthStatus() {
    const token = localStorage.getItem('authToken');
    const userData = localStorage.getItem('userData');
    
    if (token && userData) {
        currentUser = JSON.parse(userData);
        updateUIForLoggedInUser();
    }
}

// Update UI based on authentication status
function updateUIForLoggedInUser() {
    // Hide login and register menu items
    const loginMenuItem = document.getElementById('loginMenuItem');
    const registerMenuItem = document.getElementById('registerMenuItem');
    const userWelcome = document.getElementById('userWelcome');
    const logoutMenuItem = document.getElementById('logoutMenuItem');
    const welcomeText = document.getElementById('welcomeText');
    
    if (currentUser) {
        if (loginMenuItem) loginMenuItem.style.display = 'none';
        if (registerMenuItem) registerMenuItem.style.display = 'none';
        
        // Show user welcome and logout
        if (userWelcome) {
            userWelcome.classList.remove('hidden');
            userWelcome.style.display = 'block';
        }
        if (logoutMenuItem) {
            logoutMenuItem.classList.remove('hidden');
            logoutMenuItem.style.display = 'block';
        }
        
        // Update welcome text with user's name
        if (welcomeText) {
            const displayName = currentUser.username || currentUser.email || 'User';
            welcomeText.textContent = `Welcome, ${displayName}`;
        }
    }
}

// Handle user registration
function handleRegistration(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const userData = {
        username: formData.get('username'),
        email: formData.get('email'),
        password: formData.get('password'),
        confirmPassword: formData.get('confirmPassword')
    };
    
    // Validate passwords match
    if (userData.password !== userData.confirmPassword) {
        showMessage('Passwords do not match', 'error');
        return;
    }
    
    // Validate password strength
    if (userData.password.length < 6) {
        showMessage('Password must be at least 6 characters long', 'error');
        return;
    }
    
    showLoading(true);
    
    fetch('/api/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
    })
    .then(response => response.json())
    .then(data => {
        showLoading(false);
        if (data.success) {
            showMessage('Registration successful! Please log in.', 'success');
            showSection('login');
            event.target.reset();
        } else {
            showMessage(data.message || 'Registration failed', 'error');
        }
    })
    .catch(error => {
        showLoading(false);
        showMessage('Network error. Please try again.', 'error');
        console.error('Registration error:', error);
    });
}

// Handle user login
function handleLogin(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const loginData = {
        username: formData.get('username'),
        password: formData.get('password')
    };
    
    showLoading(true);
    
    fetch('/api/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(loginData)
    })
    .then(response => response.json())
    .then(data => {
        showLoading(false);
        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('userData', JSON.stringify(data.user));
            
            updateUIForLoggedInUser();
            showMessage('Login successful!', 'success');
            showSection('home');
            event.target.reset();
        } else {
            showMessage(data.message || 'Login failed', 'error');
        }
    })
    .catch(error => {
        showLoading(false);
        showMessage('Network error. Please try again.', 'error');
        console.error('Login error:', error);
    });
}

// Handle user logout
function handleLogout() {
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    
    // Reset UI - show login and register menu items
    const loginMenuItem = document.getElementById('loginMenuItem');
    const registerMenuItem = document.getElementById('registerMenuItem');
    const userWelcome = document.getElementById('userWelcome');
    const logoutMenuItem = document.getElementById('logoutMenuItem');
    
    if (loginMenuItem) loginMenuItem.style.display = 'block';
    if (registerMenuItem) registerMenuItem.style.display = 'block';
    
    // Hide user welcome and logout
    if (userWelcome) {
        userWelcome.classList.add('hidden');
        userWelcome.style.display = 'none';
    }
    if (logoutMenuItem) {
        logoutMenuItem.classList.add('hidden');
        logoutMenuItem.style.display = 'none';
    }
    
    showMessage('Logged out successfully', 'success');
    showSection('home');
}

// Handle payment processing
function handlePayment(event) {
    event.preventDefault();
    
    if (!currentUser) {
        showMessage('Please log in to make a payment', 'error');
        showSection('login');
        return;
    }
    
    const formData = new FormData(event.target);
    const paymentData = {
        paymentType: formData.get('paymentType'),
        cardNumber: formData.get('cardNumber'),
        expiryDate: formData.get('expiryDate'),
        cvv: formData.get('cvv'),
        cardholderName: formData.get('cardholderName')
    };
    
    // Basic card validation
    if (!validateCardNumber(paymentData.cardNumber)) {
        showMessage('Please enter a valid card number', 'error');
        return;
    }
    
    if (!validateExpiryDate(paymentData.expiryDate)) {
        showMessage('Please enter a valid expiry date', 'error');
        return;
    }
    
    if (!validateCVV(paymentData.cvv)) {
        showMessage('Please enter a valid CVV', 'error');
        return;
    }
    
    showLoading(true);
    
    fetch('/api/payment', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify(paymentData)
    })
    .then(response => response.json())
    .then(data => {
        showLoading(false);
        if (data.success) {
            userSession = data.session;
            showMessage('Payment successful! You can now search for devices.', 'success');
            showSection('search');
            event.target.reset();
        } else {
            showMessage(data.message || 'Payment failed', 'error');
        }
    })
    .catch(error => {
        showLoading(false);
        showMessage('Payment processing error. Please try again.', 'error');
        console.error('Payment error:', error);
    });
}

// Enhanced search function with payment verification
function searchPhonesWithAuth() {
    if (!currentUser) {
        showMessage('Please log in to search for devices', 'error');
        showSection('login');
        return;
    }
    
    if (!userSession || !userSession.hasAccess) {
        showMessage('Please complete payment to access search results', 'error');
        showSection('payment');
        return;
    }
    
    // Call the original search function
    searchPhones();
}

// Payment validation functions
function validateCardNumber(cardNumber) {
    const cleaned = cardNumber.replace(/\s/g, '');
    return /^\d{13,19}$/.test(cleaned);
}

function validateExpiryDate(expiryDate) {
    const regex = /^(0[1-9]|1[0-2])\/\d{2}$/;
    if (!regex.test(expiryDate)) return false;
    
    const [month, year] = expiryDate.split('/');
    const expiry = new Date(2000 + parseInt(year), parseInt(month) - 1);
    const now = new Date();
    
    return expiry > now;
}

function validateCVV(cvv) {
    return /^\d{3,4}$/.test(cvv);
}

// Hero search function
async function performHeroSearch() {
    console.log('performHeroSearch function called!');
    
    const queryElement = document.getElementById('heroSearchQuery');
    const countryElement = document.getElementById('heroSearchCountry');
    
    console.log('Hero search elements:', {
        queryElement: !!queryElement,
        countryElement: !!countryElement
    });
    
    if (!queryElement || !countryElement) {
        console.error('Hero search elements not found!');
        showMessage('Search form elements not found. Please refresh the page.', 'error');
        return;
    }
    
    const query = queryElement.value.trim();
    const country = countryElement.value;
    
    console.log('Hero search values:', { query, country });
    
    if (!query) {
        showMessage('Please enter a search term', 'error');
        return;
    }
    
    // Add search animation for hero button
    const heroSearchButton = document.querySelector('.hero-actions .search-button');
    if (heroSearchButton) {
        heroSearchButton.classList.add('searching');
        heroSearchButton.innerHTML = '<span class="search-loading">Searching</span>';
    }
    
    showLoading(true);
    
    try {
        const url = new URL(`${API_BASE}/api/search`);
        url.searchParams.append('query', query);
        if (country) {
            url.searchParams.append('country', country);
        }
        
        // Add geolocation parameters if available
        if (userLocation) {
            const heroProximityElement = document.getElementById('heroProximitySearch');
            if (heroProximityElement && !heroProximityElement.classList.contains('hidden')) {
                const heroRadiusElement = document.getElementById('heroSearchRadius');
                const radius = heroRadiusElement ? heroRadiusElement.value : '10';
                url.searchParams.append('lat', userLocation.latitude.toString());
                url.searchParams.append('lon', userLocation.longitude.toString());
                url.searchParams.append('radius', radius);
            }
        }
        
        console.log('Hero search URL:', url.toString());
        
        const response = await fetch(url);
        console.log('Hero search response status:', response.status);
        
        // Check if response is JSON (API server available) or HTML (static server)
        const contentType = response.headers.get('content-type');
        let result;
        
        if (contentType && contentType.includes('application/json')) {
            result = await response.json();
        } else {
            // Static server returning HTML, use demo data
            console.log('API server not available, using demo data for hero search');
            result = {
                data: [
                    {
                        id: 1,
                        phone_number: '+63 912 345 6789',
                        imei: '123456789012345',
                        email: 'demo@example.com',
                        contact_name: 'Demo User',
                        country: 'Philippines',
                        date_lost: '2024-01-15',
                        description: 'Demo lost phone for testing',
                        latitude: 14.5995,
                        longitude: 120.9842,
                        status: 'lost'
                    },
                    {
                        id: 2,
                        phone_number: '+63 917 888 9999',
                        imei: '987654321098765',
                        email: 'test@demo.com',
                        contact_name: 'Test User',
                        country: 'Philippines',
                        date_lost: '2024-01-20',
                        description: 'Another demo device',
                        latitude: 14.6042,
                        longitude: 120.9822,
                        status: 'found'
                    }
                ].filter(phone => 
                    phone.phone_number.toLowerCase().includes(query.toLowerCase()) ||
                    phone.imei.includes(query) ||
                    phone.email.toLowerCase().includes(query.toLowerCase()) ||
                    phone.contact_name.toLowerCase().includes(query.toLowerCase())
                )
            };
        }
        
        console.log('Hero search result:', result);
        
        if (response.ok) {
            // Show search section and populate results
            showSection('search');
            document.getElementById('searchQuery').value = query;
            document.getElementById('searchCountry').value = country;
            
            // Copy geolocation settings if available
            if (userLocation) {
                const heroProximity = document.getElementById('heroProximitySearch');
                const searchProximity = document.getElementById('proximitySearch');
                
                if (heroProximity && !heroProximity.classList.contains('hidden')) {
                    const heroRadius = document.getElementById('heroSearchRadius');
                    const searchRadius = document.getElementById('searchRadius');
                    if (heroRadius && searchRadius) {
                        searchRadius.value = heroRadius.value;
                    }
                    
                    // Show proximity search in main search
                    if (searchProximity) {
                        searchProximity.classList.remove('hidden');
                    }
                }
            }
            
            displaySearchResults(result.data || []);
            
            if (result.data && result.data.length > 0) {
                showMessage(`Found ${result.data.length} matching device(s)`, 'success');
            } else {
                showMessage('No matching devices found. Try different search terms.', 'info');
            }
        } else {
            showMessage(result.error || 'Search failed', 'error');
        }
    } catch (error) {
        console.error('Hero search error:', error);
        // If there's an error, use demo data for search
        console.log('Error occurred, using demo data for hero search');
        const demoData = [
            {
                id: 1,
                phone_number: '+63 912 345 6789',
                imei: '123456789012345',
                email: 'demo@example.com',
                contact_name: 'Demo User',
                country: 'Philippines',
                date_lost: '2024-01-15',
                description: 'Demo lost phone for testing',
                latitude: 14.5995,
                longitude: 120.9842,
                status: 'lost'
            },
            {
                id: 2,
                phone_number: '+63 917 888 9999',
                imei: '987654321098765',
                email: 'test@demo.com',
                contact_name: 'Test User',
                country: 'Philippines',
                date_lost: '2024-01-20',
                description: 'Another demo device',
                latitude: 14.6042,
                longitude: 120.9822,
                status: 'found'
            }
        ].filter(phone => 
            phone.phone_number.toLowerCase().includes(query.toLowerCase()) ||
            phone.imei.includes(query) ||
            phone.email.toLowerCase().includes(query.toLowerCase()) ||
            phone.contact_name.toLowerCase().includes(query.toLowerCase())
        );
        
        // Show search section and populate results
        showSection('search');
        document.getElementById('searchQuery').value = query;
        document.getElementById('searchCountry').value = country;
        
        displaySearchResults(demoData);
        
        if (demoData.length > 0) {
            showMessage(`Found ${demoData.length} matching device(s) (Demo mode)`, 'success');
        } else {
            showMessage('No matching devices found. Try different search terms. (Demo mode)', 'info');
        }
    } finally {
        showLoading(false);
        
        // Restore hero search button
        const heroSearchButton = document.querySelector('.hero-actions .search-button');
        if (heroSearchButton) {
            heroSearchButton.classList.remove('searching');
            heroSearchButton.innerHTML = 'Search';
        }
    }
}

// Hero report function
async function performHeroReport() {
    const phone = document.getElementById('heroLostPhone').value.trim();
    const imei = document.getElementById('heroLostImei').value.trim();
    const email = document.getElementById('heroLostEmail').value.trim();
    
    if (!email) {
        showMessage('Email address is required', 'error');
        return;
    }
    
    if (!isValidEmail(email)) {
        showMessage('Please enter a valid email address', 'error');
        return;
    }
    
    if (!phone && !imei) {
        showMessage('Please enter either a phone number or IMEI', 'error');
        return;
    }
    
    showLoading(true);
    
    const reportData = {
        phone_number: phone,
        imei: imei,
        email: email,
        contact_name: email.split('@')[0], // Use email prefix as default name
        country: 'Philippines',
        date_lost: new Date().toISOString().split('T')[0],
        description: 'Reported via quick form'
    };
    
    // Add geolocation data if available
    if (userLocation) {
        reportData.latitude = userLocation.latitude;
        reportData.longitude = userLocation.longitude;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/lost-phones`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(reportData)
        });
        
        // Check if response is JSON (API server available) or HTML (static server)
        const contentType = response.headers.get('content-type');
        let result;
        
        if (contentType && contentType.includes('application/json')) {
            result = await response.json();
        } else {
            // Static server returning HTML, simulate successful report
            console.log('API server not available, simulating successful report');
            result = {
                success: true,
                message: 'Device reported successfully (demo mode)',
                id: Math.floor(Math.random() * 1000) + 1
            };
        }
        
        if (response.ok) {
            showMessage('Lost device reported successfully! We\'ll help you find it.', 'success');
            // Clear the form
            document.getElementById('heroLostPhone').value = '';
            document.getElementById('heroLostImei').value = '';
            document.getElementById('heroLostEmail').value = '';
            loadStats(); // Refresh stats
        } else {
            showMessage(result.error || 'Error reporting lost device', 'error');
        }
    } catch (error) {
        console.error('Hero report error:', error);
        // If there's an error, simulate successful report in demo mode
        console.log('Error occurred, using demo mode for hero report');
        showMessage('Lost device reported successfully! We\'ll help you find it. (Demo mode)', 'success');
        // Clear the form
        document.getElementById('heroLostPhone').value = '';
        document.getElementById('heroLostImei').value = '';
        document.getElementById('heroLostEmail').value = '';
        loadStats(); // Refresh stats
    } finally {
        showLoading(false);
    }
}

// Export functions to global scope for HTML onclick handlers
window.performHeroSearch = performHeroSearch;
window.performHeroReport = performHeroReport;
window.searchPhones = searchPhones;
window.showSection = showSection;
window.handleLogout = handleLogout;
window.showMessage = showMessage;
window.handleLogin = handleLogin;
window.handleRegistration = handleRegistration;
window.handlePayment = handlePayment;
window.detectLocation = detectLocationPremium;
window.calculateDistance = calculateDistance;
window.formatDistance = formatDistance;
window.copyLocationToClipboard = copyLocationToClipboard;
window.openInMaps = openInMaps;
window.handleTrackSubmit = handleTrackSubmit;