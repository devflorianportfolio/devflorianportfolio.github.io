class SecurityManager {
    constructor() {
        this.logs = [];
        this.userInfo = {};
        this.suspiciousActivity = 0;
        this.init();
    }

    init() {
        this.collectUserInfo();
        this.setupProtections();
        this.monitorActivity();
        this.sendInitialLog();
    }

    collectUserInfo() {
        this.userInfo = {
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            languages: navigator.languages,
            cookieEnabled: navigator.cookieEnabled,
            javaEnabled: navigator.javaEnabled ? navigator.javaEnabled() : false,
            screenResolution: `${screen.width}x${screen.height}`,
            colorDepth: screen.colorDepth,
            pixelDepth: screen.pixelDepth,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            connection: navigator.connection ? {
                effectiveType: navigator.connection.effectiveType,
                downlink: navigator.connection.downlink,
                rtt: navigator.connection.rtt
            } : null,
            hardwareConcurrency: navigator.hardwareConcurrency,
            maxTouchPoints: navigator.maxTouchPoints,
            webdriver: navigator.webdriver,
            plugins: Array.from(navigator.plugins).map(p => p.name),
            mimeTypes: Array.from(navigator.mimeTypes).map(m => m.type)
        };
        this.getLocationInfo();
    }

    async getLocationInfo() {
        try {
            const response = await fetch('https://ipapi.co/json/');
            const locationData = await response.json();
            this.userInfo.location = locationData;
        } catch (error) {
            this.userInfo.location = { error: 'Unable to fetch location' };
        }
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.userInfo.geoLocation = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    };
                },
                (error) => {
                    this.userInfo.geoLocation = { error: error.message };
                }
            );
        }
    }

    setupProtections() {
        document.addEventListener('contextmenu', (e) => {
            if (this.portfolio.isAdmin) return; 
            e.preventDefault();
            this.logSuspiciousActivity('Right-click attempted');
            return false;
        });
        document.addEventListener('keydown', (e) => {
            if (this.portfolio.isAdmin) return; 
            if (e.keyCode === 123 || 
                (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74)) ||
                (e.ctrlKey && (e.keyCode === 85 || e.keyCode === 83 || e.keyCode === 65 || e.keyCode === 80))) {
                e.preventDefault();
                this.logSuspiciousActivity(`Blocked shortcut: ${e.keyCode}`);
                return false;
            }
        });

        document.addEventListener('dragstart', (e) => {
            e.preventDefault();
            this.logSuspiciousActivity('Drag attempt detected');
            return false;
        });

        document.addEventListener('selectstart', (e) => {
            if (e.target.tagName === 'IMG') {
                e.preventDefault();
                return false;
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.keyCode === 44) {
                this.logSuspiciousActivity('Print Screen key detected');
            }
        });

        this.detectDevTools();
    }

    detectDevTools() {
        const threshold = 160;
        let devtools = {
            open: false,
            orientation: null
        };

        const check = () => {
            if (window.outerHeight - window.innerHeight > threshold || 
                window.outerWidth - window.innerWidth > threshold) {
                if (!devtools.open) {
                    devtools.open = true;
                    this.logSuspiciousActivity('Developer tools opened');
                    this.handleDevToolsDetection();
                }
            } else {
                devtools.open = false;
            }
        };

        setInterval(check, 500);

        let devToolsChecker = () => {
            let before = new Date();
            debugger;
            let after = new Date();
            if (after - before > 100) {
                this.logSuspiciousActivity('Debugger statement detected');
            }
        };

        setInterval(devToolsChecker, 1000);
    }

    handleDevToolsDetection() {
        if (this.portfolio.isAdmin) return; 
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(255, 0, 0, 0.9);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            font-size: 24px;
            text-align: center;
        `;
        overlay.innerHTML = `
            <div>
                <h2>⚠️ ACCÈS NON AUTORISÉ DÉTECTÉ ⚠️</h2>
                <p>Les outils de développement sont interdits sur ce site.</p>
                <p>Votre activité a été enregistrée et signalée.</p>
            </div>
        `;
        document.body.appendChild(overlay);

        setTimeout(() => {
            document.body.removeChild(overlay);
        }, 3000);
    }

    monitorActivity() {
        let mouseMoves = 0;
        document.addEventListener('mousemove', () => {
            mouseMoves++;
            if (mouseMoves % 100 === 0) {
                this.logActivity(`Mouse moves: ${mouseMoves}`);
            }
        });

        document.addEventListener('click', (e) => {
            this.logActivity(`Click on: ${e.target.tagName} at ${e.clientX},${e.clientY}`);
        });

        let scrollCount = 0;
        window.addEventListener('scroll', () => {
            scrollCount++;
            if (scrollCount % 10 === 0) {
                this.logActivity(`Scroll events: ${scrollCount}`);
            }
        });

        document.addEventListener('visibilitychange', () => {
            this.logActivity(`Page visibility: ${document.hidden ? 'hidden' : 'visible'}`);
        });

        window.addEventListener('blur', () => {
            this.logActivity('Window lost focus');
        });

        window.addEventListener('focus', () => {
            this.logActivity('Window gained focus');
        });
    }

    logSuspiciousActivity(activity) {
        this.suspiciousActivity++;
        const logEntry = {
            type: 'SUSPICIOUS',
            activity: activity,
            timestamp: new Date().toISOString(),
            userInfo: this.userInfo,
            url: window.location.href,
            referrer: document.referrer
        };
        
        this.logs.push(logEntry);
        this.sendLogToDiscord(logEntry);
        
        if (this.suspiciousActivity > 5) {
            this.blockUser();
        }
    }

    logActivity(activity) {
        const logEntry = {
            type: 'ACTIVITY',
            activity: activity,
            timestamp: new Date().toISOString(),
            url: window.location.href
        };
        
        this.logs.push(logEntry);
        
        if (activity.includes('Click') || activity.includes('Page visibility')) {
            this.sendLogToDiscord(logEntry);
        }
    }

    sendInitialLog() {
        const logEntry = {
            type: 'VISIT',
            activity: 'New visitor on portfolio',
            timestamp: new Date().toISOString(),
            userInfo: this.userInfo,
            url: window.location.href,
            referrer: document.referrer
        };
        
        this.logs.push(logEntry);
        this.sendLogToDiscord(logEntry);
    }

    async sendLogToDiscord(logEntry) {
        const webhookUrl = 'https://discord.com/api/webhooks/1376614986662543430/drlZfgzVNei5tVbh_PcFFRu5Yp6Nq4KHNgNR4VxXljVV4rZmZ-nmZeWJsZUKAkJqadB3';
        
        const embed = {
            title: `🔒 Portfolio Security Log - ${logEntry.type}`,
            description: logEntry.activity,
            color: logEntry.type === 'SUSPICIOUS' ? 16711680 : logEntry.type === 'VISIT' ? 65280 : 16776960,
            timestamp: logEntry.timestamp,
            fields: [
                {
                    name: '🌐 URL',
                    value: logEntry.url,
                    inline: true
                },
                {
                    name: '🔗 Referrer',
                    value: logEntry.referrer || 'Direct',
                    inline: true
                }
            ]
        };

        if (logEntry.userInfo) {
            embed.fields.push(
                {
                    name: '💻 Device Info',
                    value: `${logEntry.userInfo.platform} - ${logEntry.userInfo.screenResolution}`,
                    inline: true
                },
                {
                    name: '🌍 Location',
                    value: logEntry.userInfo.location ? 
                        `${logEntry.userInfo.location.city}, ${logEntry.userInfo.location.country}` : 
                        'Unknown',
                    inline: true
                },
                {
                    name: '🕒 Timezone',
                    value: logEntry.userInfo.timezone,
                    inline: true
                },
                {
                    name: '🌐 Browser',
                    value: logEntry.userInfo.userAgent.split(' ').slice(-2).join(' '),
                    inline: false
                }
            );
        }

        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    embeds: [embed]
                })
            });
        } catch (error) {
            console.error('Failed to send log to Discord:', error);
        }
    }

    blockUser() {
        document.body.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100vh; background: #000; color: #fff; text-align: center;">
                <div>
                    <h1>🚫 ACCÈS BLOQUÉ</h1>
                    <p>Trop d'activités suspectes détectées.</p>
                    <p>Votre accès a été temporairement bloqué.</p>
                </div>
            </div>
        `;
    }

    getLogs() {
        return this.logs;
    }
}

class PhotographyPortfolio {
    constructor() {
        this.currentImageIndex = 0;
        this.images = [];
        this.heroSlideIndex = 0;
        this.isAdmin = false;
        this.adminPassword = 'PhotoAdmin2024!';
        this.uploadedImages = this.loadImagesFromStorage();
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializeComponents();
        this.loadPortfolioImages();
        this.startHeroSlideshow();
        this.handlePrivacyModal();
        this.initializeAdmin();
    }

    setupEventListeners() {
        document.getElementById('hamburger')?.addEventListener('click', this.toggleMobileMenu);
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href').substring(1);
                this.scrollToSection(targetId);
            });
        });
        document.getElementById('contact-form')?.addEventListener('submit', this.handleContactForm.bind(this));
        document.querySelector('.close-modal')?.addEventListener('click', this.closeImageModal);
        document.querySelector('.prev-btn')?.addEventListener('click', () => this.navigateImage(-1));
        document.querySelector('.next-btn')?.addEventListener('click', () => this.navigateImage(1));
        document.getElementById('admin-btn')?.addEventListener('click', this.openAdminPanel);
        document.getElementById('close-admin')?.addEventListener('click', this.closeAdminPanel);
        document.getElementById('admin-login')?.addEventListener('click', this.handleAdminLogin.bind(this));
        document.getElementById('accept-terms')?.addEventListener('change', this.toggleAcceptButton.bind(this));
        document.getElementById('accept-btn')?.addEventListener('click', this.acceptTerms.bind(this));
        document.getElementById('decline-btn')?.addEventListener('click', this.declineTerms.bind(this));
        this.setupUploadListeners();
        window.addEventListener('scroll', this.handleScroll);
        document.addEventListener('keydown', (e) => this.handleKeyboardNavigation(e));
    }

    loadImagesFromStorage() {
        const storedImages = localStorage.getItem('uploadedImages');
        return storedImages ? JSON.parse(storedImages) : [];
    }

    handleKeyboardNavigation(e) {
        if (document.getElementById('image-modal').style.display === 'flex') {
            if (e.key === 'ArrowLeft') {
                this.navigateImage(-1);
            } else if (e.key === 'ArrowRight') {
                this.navigateImage(1);
            } else if (e.key === 'Escape') {
                this.closeImageModal();
            }
        }
    }

    initializeComponents() {
        this.security = new SecurityManager();
        this.showLoadingScreen();
        this.setupIntersectionObserver();
    }

    showLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        
        setTimeout(() => {
            loadingScreen.style.opacity = '0';
            loadingScreen.style.visibility = 'hidden';
        }, 2000);
    }

    handlePrivacyModal() {
        const modal = document.getElementById('privacy-modal');
        const hasAccepted = localStorage.getItem('privacy-accepted');
        
        if (!hasAccepted) {
            modal.style.display = 'flex';
        } else {
            modal.style.display = 'none';
        }
    }

    toggleAcceptButton() {
        const checkbox = document.getElementById('accept-terms');
        const acceptBtn = document.getElementById('accept-btn');
        acceptBtn.disabled = !checkbox.checked;
    }

    acceptTerms() {
        localStorage.setItem('privacy-accepted', 'true');
        document.getElementById('privacy-modal').style.display = 'none';
        if (this.security) {
            this.security.logActivity('Privacy terms accepted');
        }
    }

    declineTerms() {
        window.location.href = 'https://google.com';
    }

    loadPortfolioImages() {
        this.images = [
            {
                id: 1,
                src: 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&h=600&fit=crop',
                title: 'Portrait Élégant',
                location: 'Paris, France',
                equipment: 'Canon 5D Mark IV, 85mm f/1.4',
                date: '2024-03-15',
                category: 'portrait'
            },
            {
                id: 2,
                src: 'https://images.unsplash.com/photo-1471341971476-ae15ff5dd4ea?w=800&h=600&fit=crop',
                title: 'Mariage Romantique',
                location: 'Château de Versailles',
                equipment: 'Canon 5D Mark IV, 24-70mm f/2.8',
                date: '2024-02-20',
                category: 'wedding'
            },
            {
                id: 3,
                src: 'https://images.unsplash.com/photo-1500322969630-a26ab6eb64cc?w=800&h=600&fit=crop',
                title: 'Session Corporate',
                location: 'La Défense, Paris',
                equipment: 'Canon 5D Mark IV, 50mm f/1.2',
                date: '2024-01-10',
                category: 'corporate'
            },
            {
                id: 4,
                src: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=600&fit=crop',
                title: 'Portrait Naturel',
                location: 'Bois de Vincennes',
                equipment: 'Canon 5D Mark IV, 135mm f/2',
                date: '2024-04-05',
                category: 'portrait'
            },
            {
                id: 5,
                src: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=800&h=600&fit=crop',
                title: 'Événement Familial',
                location: 'Montmartre, Paris',
                equipment: 'Canon 5D Mark IV, 70-200mm f/2.8',
                date: '2024-03-25',
                category: 'event'
            }
        ];

        this.images = [...this.images, ...this.uploadedImages];

        this.displayPreviewImages();
    }

    displayPreviewImages() {
        const previewGrid = document.getElementById('preview-grid');
        if (!previewGrid) return;

        const previewImages = this.images.slice(0, 4);
        
        previewGrid.innerHTML = previewImages.map((image, index) => `
            <div class="preview-item" data-aos="fade-up" data-aos-delay="${index * 100}">
                <div class="preview-image-container">
                    <img src="${image.src}" alt="${image.title}" class="preview-image protected-image" onclick="portfolio.openImageModal(${image.id})">
                    <div class="preview-overlay">
                        <div class="preview-info">
                            <h3>${image.title}</h3>
                            <p>${image.location}</p>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    openImageModal(imageId) {
        const image = this.images.find(img => img.id === imageId);
        if (!image) return;

        this.currentImageIndex = this.images.findIndex(img => img.id === imageId);
        
        const modal = document.getElementById('image-modal');
        const modalImage = document.getElementById('modal-image');
        const imageTitle = document.getElementById('image-title');
        const imageLocation = document.getElementById('image-location');
        const imageEquipment = document.getElementById('image-equipment');
        const imageDate = document.getElementById('image-date');

        modalImage.src = image.src;
        modalImage.alt = image.title;
        imageTitle.textContent = image.title;
        imageLocation.textContent = `📍 ${image.location}`;
        imageEquipment.textContent = `📷 ${image.equipment}`;
        imageDate.textContent = `📅 ${new Date(image.date).toLocaleDateString('fr-FR')}`;

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        this.security.logActivity(`Image viewed: ${image.title}`);
    }

    closeImageModal() {
        const modal = document.getElementById('image-modal');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    navigateImage(direction) {
        this.currentImageIndex += direction;
        
        if (this.currentImageIndex >= this.images.length) {
            this.currentImageIndex = 0;
        } else if (this.currentImageIndex < 0) {
            this.currentImageIndex = this.images.length - 1;
        }

        const image = this.images[this.currentImageIndex];
        this.openImageModal(image.id);
    }

    startHeroSlideshow() {
        const slides = document.querySelectorAll('.hero-slide');
        if (slides.length === 0) return;

        slides.forEach((slide, index) => {
            const bgUrl = slide.dataset.bg;
            if (bgUrl) {
                slide.style.backgroundImage = `url(${bgUrl})`;
            }
        });

        setInterval(() => {
            slides[this.heroSlideIndex].classList.remove('active');
            this.heroSlideIndex = (this.heroSlideIndex + 1) % slides.length;
            slides[this.heroSlideIndex].classList.add('active');
        }, 5000);
    }

    scrollToSection(sectionId) {
        const element = document.getElementById(sectionId);
        if (element) {
            const offsetTop = element.offsetTop - 70;
            window.scrollTo({
                top: offsetTop,
                behavior: 'smooth'
            });
        }
    }

    handleScroll() {
        const navbar = document.getElementById('navbar');
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }

        const sections = document.querySelectorAll('section[id]');
        const scrollPos = window.scrollY + 100;

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.getAttribute('id');

            if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
                document.querySelectorAll('.nav-link').forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${sectionId}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }

    handleContactForm(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const contactData = {
            name: formData.get('name'),
            email: formData.get('email'),
            phone: formData.get('phone'),
            service: formData.get('service'),
            message: formData.get('message'),
            timestamp: new Date().toISOString()
        };

        console.log('Contact form submitted:', contactData);

        this.sendContactToDiscord(contactData);

        alert('Merci pour votre message ! Je vous répondrai dans les plus brefs délais.');
        e.target.reset();

        this.security.logActivity('Contact form submitted');
    }

    async sendContactToDiscord(contactData) {
        const webhookUrl = 'YOUR_DISCORD_WEBHOOK_URL_HERE';
        
        const embed = {
            title: '📧 Nouveau Contact Portfolio',
            color: 3447003,
            timestamp: contactData.timestamp,
            fields: [
                {
                    name: '👤 Nom',
                    value: contactData.name,
                    inline: true
                },
                {
                    name: '📧 Email',
                    value: contactData.email,
                    inline: true
                },
                {
                    name: '📱 Téléphone',
                    value: contactData.phone || 'Non fourni',
                    inline: true
                },
                {
                    name: '🎯 Service',
                    value: contactData.service,
                    inline: true
                },
                {
                    name: '💬 Message',
                    value: contactData.message,
                    inline: false
                }
            ]
        };

        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    embeds: [embed]
                })
            });
        } catch (error) {
            console.error('Failed to send contact to Discord:', error);
        }
    }

    initializeAdmin() {
        this.setupAdminTabs();
        this.loadAdminGallery();
        this.displaySecurityLogs();
    }

    openAdminPanel() {
        document.getElementById('admin-panel').style.display = 'flex';
    }

    closeAdminPanel() {
        document.getElementById('admin-panel').style.display = 'none';
    }

    handleAdminLogin() {
        const password = document.getElementById('admin-password').value;
        
        if (password === this.adminPassword) {
            this.isAdmin = true;
            document.getElementById('admin-auth').style.display = 'none';
            document.getElementById('admin-dashboard').style.display = 'block';
            this.security.setupProtections();
            document.body.classList.add('admin-mode');
            
            this.security.logActivity('Admin login successful');
            alert('Mode admin activé - Les protections sont désactivées');
        } else {
            alert('Mot de passe incorrect');
            this.security.logSuspiciousActivity('Failed admin login attempt');
        }
    }

    setupAdminTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchAdminTab(tabName);
            });
        });
    }

    switchAdminTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');

        if (tabName === 'logs') {
            this.displaySecurityLogs();
        } else if (tabName === 'gallery') {
            this.loadAdminGallery();
        }
    }

    setupUploadListeners() {
        const uploadArea = document.getElementById('upload-area');
        const fileInput = document.getElementById('file-input');

        uploadArea?.addEventListener('click', () => fileInput?.click());
        uploadArea?.addEventListener('dragover', this.handleDragOver);
        uploadArea?.addEventListener('drop', this.handleDrop.bind(this));
        fileInput?.addEventListener('change', this.handleFileSelect.bind(this));
    }

    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        this.processFiles(files);
    }

    handleFileSelect(e) {
        const files = e.target.files;
        this.processFiles(files);
    }

    processFiles(files) {
        const uploadQueue = document.getElementById('upload-queue');
        
        Array.from(files).forEach(file => {
            if (file.type.startsWith('image/')) {
                this.uploadImage(file, uploadQueue);
            }
        });
    }

    uploadImage(file, container) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const imageData = {
                id: Date.now() + Math.random(),
                src: e.target.result,
                title: file.name.split('.')[0],
                location: 'À définir',
                equipment: 'À définir',
                date: new Date().toISOString().split('T')[0],
                category: 'uploaded'
            };

            this.uploadedImages.push(imageData);
            this.images.push(imageData);
            this.saveImagesToStorage();
            
            const uploadItem = document.createElement('div');
            uploadItem.className = 'upload-item';
            uploadItem.innerHTML = `
                <img src="${imageData.src}" alt="${imageData.title}" class="upload-thumb">
                <div class="upload-details">
                    <input type="text" value="${imageData.title}" onchange="portfolio.updateImageTitle(${imageData.id}, this.value)">
                    <input type="text" value="${imageData.location}" onchange="portfolio.updateImageLocation(${imageData.id}, this.value)">
                    <input type="text" value="${imageData.equipment}" onchange="portfolio.updateImageEquipment(${imageData.id}, this.value)">
                </div>
                <button onclick="portfolio.deleteImage(${imageData.id})" class="delete-btn">🗑️</button>
            `;
            
            container.appendChild(uploadItem);
            this.loadAdminGallery();
            this.displayPreviewImages();
            
            this.security.logActivity(`Image uploaded: ${file.name}`);
        };
        
        reader.readAsDataURL(file);
    }

    updateImageTitle(imageId, newTitle) {
        const image = this.images.find(img => img.id === imageId);
        if (image) {
            image.title = newTitle;
            this.saveImagesToStorage();
        }
    }

    updateImageLocation(imageId, newLocation) {
        const image = this.images.find(img => img.id === imageId);
        if (image) {
            image.location = newLocation;
            this.saveImagesToStorage();
        }
    }

    updateImageEquipment(imageId, newEquipment) {
        const image = this.images.find(img => img.id === imageId);
        if (image) {
            image.equipment = newEquipment;
            this.saveImagesToStorage();
        }
    }

    deleteImage(imageId) {
        this.images = this.images.filter(img => img.id !== imageId);
        this.uploadedImages = this.uploadedImages.filter(img => img.id !== imageId);
        this.saveImagesToStorage();
        this.loadAdminGallery();
        this.displayPreviewImages();
        this.security.logActivity(`Image deleted: ${imageId}`);
    }

    loadAdminGallery() {
        const adminGallery = document.getElementById('admin-gallery');
        if (!adminGallery) return;

        adminGallery.innerHTML = this.images.map(image => `
            <div class="admin-image-item" data-aos="fade-up" data-aos-delay="${index * 100}">
                <img src="${image.src}" alt="${image.title}" class="protected-image" onclick="portfolio.openImageModal(${image.id})">
                <div class="admin-image-overlay">
                    <div class="admin-image-info">
                        <h3>${image.title}</h3>
                        <p>${image.location}</p>
                    </div>
                </div>
            </div>
        `).join('');
    }

    saveImagesToStorage() {
        localStorage.setItem('uploadedImages', JSON.stringify(this.uploadedImages));
    }
}

const portfolio = new PhotographyPortfolio();
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.querySelector('.theme-icon');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
let currentTheme = localStorage.getItem('theme') || (prefersDark ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', currentTheme);
updateThemeIcon(currentTheme);

themeToggle.addEventListener('click', () => {
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    currentTheme = newTheme;
    updateThemeIcon(newTheme);
});

function updateThemeIcon(theme) {
    if (theme === 'dark') {
        themeIcon.textContent = '☀️';
        themeIcon.setAttribute('aria-label', 'Passer en mode clair');
    } else {
        themeIcon.textContent = '🌙';
        themeIcon.setAttribute('aria-label', 'Passer en mode sombre');
    }
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('theme')) {
        const newTheme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        currentTheme = newTheme;
        updateThemeIcon(newTheme);
    }
});