class GalleryManager {
    constructor() {
        this.uploadedImagesKey = 'uploadedImages';
        this.adminIPs = ['127.0.0.1', '192.168.10.27'];
        this.isAdmin = false;
        this.init();
    }

    async init() {
        await this.checkAdminStatus();
        this.setupAdminPanel();
        this.loadAllImages();
        this.setupEventListeners();
    }

    async checkAdminStatus() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            this.isAdmin = this.adminIPs.includes(data.ip);
        } catch (error) {
            console.error('IP check failed:', error);
            this.isAdmin = false;
        }
    }

    setupAdminPanel() {
        if (this.isAdmin) {
            const adminBtn = document.createElement('button');
            adminBtn.id = 'admin-btn';
            adminBtn.className = 'admin-btn';
            adminBtn.textContent = 'Admin';
            adminBtn.addEventListener('click', () => this.toggleAdminPanel());
            
            const navControls = document.querySelector('.nav-controls');
            if (navControls) navControls.prepend(adminBtn);

            this.renderAdminPanel();
        }
    }

    renderAdminPanel() {
        const adminPanel = document.createElement('div');
        adminPanel.id = 'admin-panel';
        adminPanel.className = 'admin-panel';
        adminPanel.innerHTML = `
            <div class="admin-content">
                <div class="admin-header">
                    <h3>Administration Galerie</h3>
                    <button class="close-admin">✕</button>
                </div>
                <div class="admin-tabs">
                    <button class="admin-tab active" data-tab="upload">Upload</button>
                    <button class="admin-tab" data-tab="manage">Gérer</button>
                </div>
                <div class="tab-content active" id="upload-tab">
                    <div class="upload-area" id="upload-area">
                        <input type="file" id="file-input" accept="image/*" multiple style="display: none;">
                        <p>Glissez-déposez des images ici ou cliquez pour sélectionner</p>
                        <button id="select-files" class="btn-primary">Sélectionner des fichiers</button>
                    </div>
                    <div id="upload-progress"></div>
                </div>
                <div class="tab-content" id="manage-tab">
                    <div class="search-bar">
                        <input type="text" id="image-search" placeholder="Rechercher des images...">
                    </div>
                    <div id="image-management-grid" class="management-grid"></div>
                </div>
            </div>
        `;
        document.body.appendChild(adminPanel);
    }

    toggleAdminPanel() {
        const panel = document.getElementById('admin-panel');
        panel.classList.toggle('active');
    }

    loadAllImages() {
        const defaultImages = [...galleryData];
        const uploadedImages = JSON.parse(localStorage.getItem(this.uploadedImagesKey)) || [];
        this.allImages = [...defaultImages, ...uploadedImages];
        return this.allImages;
    }

    async uploadImages(files) {
        const uploads = Array.from(files).map(file => this.uploadImage(file));
        return Promise.all(uploads);
    }

    async uploadImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const newImage = {
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    src: e.target.result,
                    title: file.name.replace(/\.[^/.]+$/, ""),
                    description: "Nouvelle image uploadée",
                    category: "uploaded",
                    location: "Non spécifié",
                    equipment: "Non spécifié",
                    date: new Date().toLocaleDateString('fr-FR'),
                    featured: false
                };

                const uploadedImages = JSON.parse(localStorage.getItem(this.uploadedImagesKey)) || [];
                uploadedImages.push(newImage);
                localStorage.setItem(this.uploadedImagesKey, JSON.stringify(uploadedImages));
                window.dispatchEvent(new Event('storage'));

                resolve(newImage);
            };
            reader.readAsDataURL(file);
        });
    }

    deleteImage(imageId) {
        let uploadedImages = JSON.parse(localStorage.getItem(this.uploadedImagesKey)) || [];
        uploadedImages = uploadedImages.filter(img => img.id !== imageId);
        localStorage.setItem(this.uploadedImagesKey, JSON.stringify(uploadedImages));
        window.dispatchEvent(new Event('storage'));
        return true;
    }

    updateImage(imageId, updates) {
        let uploadedImages = JSON.parse(localStorage.getItem(this.uploadedImagesKey)) || [];
        const index = uploadedImages.findIndex(img => img.id === imageId);
        
        if (index !== -1) {
            uploadedImages[index] = { ...uploadedImages[index], ...updates };
            localStorage.setItem(this.uploadedImagesKey, JSON.stringify(uploadedImages));
            window.dispatchEvent(new Event('storage'));
            return true;
        }
        return false;
    }

    setupEventListeners() {
        const uploadArea = document.getElementById('upload-area');
        const fileInput = document.getElementById('file-input');
        const selectFilesBtn = document.getElementById('select-files');

        if (uploadArea && fileInput && selectFilesBtn) {
            uploadArea.addEventListener('click', () => fileInput.click());
            selectFilesBtn.addEventListener('click', () => fileInput.click());
            
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = 'var(--accent-color)';
                uploadArea.style.backgroundColor = 'rgba(231, 76, 60, 0.1)';
            });

            uploadArea.addEventListener('dragleave', () => {
                uploadArea.style.borderColor = 'var(--border-color)';
                uploadArea.style.backgroundColor = '';
            });

            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = 'var(--border-color)';
                uploadArea.style.backgroundColor = '';
                
                if (e.dataTransfer.files.length > 0) {
                    this.handleFiles(e.dataTransfer.files);
                }
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFiles(e.target.files);
                }
            });
        }
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('admin-tab')) {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
            }
            
            if (e.target.classList.contains('close-admin')) {
                this.toggleAdminPanel();
            }
        });
    }

    async handleFiles(files) {
        const progress = document.getElementById('upload-progress');
        if (progress) progress.innerHTML = '<p>Téléversement en cours...</p>';
        
        try {
            await this.uploadImages(files);
            if (progress) progress.innerHTML = '<p>Téléversement terminé!</p>';
            setTimeout(() => { 
                if (progress) progress.innerHTML = ''; 
            }, 2000);
            this.loadAllImages();
            loadImages();
            this.loadManagementGrid();
        } catch (error) {
            console.error('Upload failed:', error);
            if (progress) progress.innerHTML = '<p>Erreur lors du téléversement</p>';
        }
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.admin-tab').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
        document.querySelector(`.admin-tab[data-tab="${tabName}"]`).classList.add('active');
        if (tabName === 'manage') {
            this.loadManagementGrid();
        }
    }

    loadManagementGrid() {
        const grid = document.getElementById('image-management-grid');
        if (!grid) return;
        
        const uploadedImages = JSON.parse(localStorage.getItem(this.uploadedImagesKey)) || [];
        
        grid.innerHTML = uploadedImages.map(image => `
            <div class="management-item" data-id="${image.id}">
                <img src="${image.src}" alt="${image.title}">
                <div class="management-actions">
                    <button class="management-btn edit-btn" data-id="${image.id}">✏️</button>
                    <button class="management-btn delete-btn" data-id="${image.id}">🗑️</button>
                </div>
            </div>
        `).join('');
        
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.target.dataset.id);
                if (confirm('Supprimer cette image ?')) {
                    this.deleteImage(id);
                    this.loadManagementGrid();
                }
            });
        });
        
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.target.dataset.id);
                this.openEditModal(id);
            });
        });
    }

    openEditModal(imageId) {
        const uploadedImages = JSON.parse(localStorage.getItem(this.uploadedImagesKey)) || [];
        const image = uploadedImages.find(img => img.id === imageId);
        
        if (!image) return;
        
        const modal = document.createElement('div');
        modal.className = 'edit-modal';
        modal.innerHTML = `
            <div class="edit-modal-content">
                <h3>Modifier l'image</h3>
                <img src="${image.src}" alt="${image.title}">
                
                <div class="edit-form">
                    <div class="form-group">
                        <label>Titre</label>
                        <input type="text" id="edit-title" value="${image.title}">
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <textarea id="edit-desc">${image.description}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Catégorie</label>
                        <select id="edit-category">
                            <option value="portraits" ${image.category === 'portraits' ? 'selected' : ''}>Portraits</option>
                            <option value="mariages" ${image.category === 'mariages' ? 'selected' : ''}>Mariages</option>
                            <option value="evenements" ${image.category === 'evenements' ? 'selected' : ''}>Événements</option>
                            <option value="nature" ${image.category === 'nature' ? 'selected' : ''}>Nature</option>
                            <option value="urbain" ${image.category === 'urbain' ? 'selected' : ''}>Urbain</option>
                            <option value="uploaded" ${image.category === 'uploaded' ? 'selected' : ''}>Autre</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Lieu</label>
                        <input type="text" id="edit-location" value="${image.location}">
                    </div>
                    <div class="form-group">
                        <label>Équipement</label>
                        <input type="text" id="edit-equipment" value="${image.equipment}">
                    </div>
                    <div class="form-group">
                        <label>Date</label>
                        <input type="date" id="edit-date" value="${new Date(image.date).toISOString().split('T')[0]}">
                    </div>
                    
                    <div class="form-actions">
                        <button class="btn-primary" id="save-edit">Enregistrer</button>
                        <button class="btn-secondary" id="cancel-edit">Annuler</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        document.getElementById('save-edit').addEventListener('click', () => {
            const updates = {
                title: document.getElementById('edit-title').value,
                description: document.getElementById('edit-desc').value,
                category: document.getElementById('edit-category').value,
                location: document.getElementById('edit-location').value,
                equipment: document.getElementById('edit-equipment').value,
                date: document.getElementById('edit-date').value
            };
            
            this.updateImage(imageId, updates);
            modal.remove();
            this.loadManagementGrid();
            loadImages();
        });
        
        document.getElementById('cancel-edit').addEventListener('click', () => {
            modal.remove();
        });
    }
}


const galleryManager = new GalleryManager();
let currentImageIndex = 0;
let filteredImages = [];
let allImages = [];
let currentFilter = 'all';
let currentView = 'grid';
let imagesLoaded = 0;
let totalImagesToLoad = 10;
let isModalOpen = false;

const galleryData = [
    {
        id: 1,
        src: "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&h=600&fit=crop",
        title: "Portrait Élégant",
        description: "Un portrait captivant mettant en valeur la beauté naturelle.",
        category: "portraits",
        location: "Paris, France",
        equipment: "Canon EOS R5, 85mm f/1.4",
        date: "15 Mars 2024",
        featured: true
    },
    {
        id: 2,
        src: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=600&fit=crop",
        title: "Cérémonie de Mariage",
        description: "Moments magiques capturés lors d'une cérémonie intime.",
        category: "mariages",
        location: "Château de Versailles",
        equipment: "Sony A7III, 24-70mm f/2.8",
        date: "22 Juin 2024",
        featured: true
    },
    {
        id: 3,
        src: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=800&h=600&fit=crop",
        title: "Événement Corporate",
        description: "Conférence d'entreprise avec ambiance professionnelle.",
        category: "evenements",
        location: "La Défense, Paris",
        equipment: "Nikon D850, 70-200mm f/2.8",
        date: "10 Septembre 2024",
        featured: false
    },
    {
        id: 4,
        src: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&h=600&fit=crop",
        title: "Paysage Forestier",
        description: "La beauté sauvage de la forêt normande au petit matin.",
        category: "nature",
        location: "Normandie, France",
        equipment: "Canon EOS R6, 16-35mm f/2.8",
        date: "5 Octobre 2024",
        featured: true
    },
    {
        id: 5,
        src: "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1f?w=800&h=600&fit=crop",
        title: "Architecture Moderne",
        description: "Jeu de lignes et de lumières dans l'architecture contemporaine.",
        category: "urbain",
        location: "Lyon, France",
        equipment: "Sony A7R IV, 24-105mm f/4",
        date: "18 Novembre 2024",
        featured: false
    },
    {
        id: 6,
        src: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=600&fit=crop",
        title: "Portrait Artistique",
        description: "Expression créative à travers un portrait noir et blanc.",
        category: "portraits",
        location: "Studio, Paris",
        equipment: "Fujifilm GFX 100S, 110mm f/2",
        date: "3 Décembre 2024",
        featured: true
    },
    {
        id: 7,
        src: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=800&h=600&fit=crop",
        title: "Première Danse",
        description: "L'émotion pure d'un premier moment de bonheur partagé.",
        category: "mariages",
        location: "Provence, France",
        equipment: "Canon EOS R5, 50mm f/1.2",
        date: "12 Juillet 2024",
        featured: true
    },
    {
        id: 8,
        src: "https://images.unsplash.com/photo-1429734956993-8a9b0555e122?w=800&h=600&fit=crop",
        title: "Soirée de Gala",
        description: "Ambiance sophistiquée lors d'un événement de prestige.",
        category: "evenements",
        location: "Opéra de Paris",
        equipment: "Nikon Z9, 85mm f/1.8",
        date: "28 Octobre 2024",
        featured: false
    },
    {
        id: 9,
        src: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop",
        title: "Coucher de Soleil",
        description: "Magnifique coucher de soleil sur la côte bretonne.",
        category: "nature",
        location: "Bretagne, France",
        equipment: "Canon EOS R6, 70-200mm f/4",
        date: "15 Août 2024",
        featured: true
    },
    {
        id: 10,
        src: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800&h=600&fit=crop",
        title: "Skyline Urbain",
        description: "Vue panoramique sur le skyline de la ville lumière.",
        category: "urbain",
        location: "Tour Montparnasse, Paris",
        equipment: "Sony A7III, 16-35mm f/2.8",
        date: "25 Septembre 2024",
        featured: false
    },
    {
        id: 11,
        src: "https://images.unsplash.com/photo-1494790108755-2616c667bb47?w=800&h=600&fit=crop",
        title: "Portrait de Famille",
        description: "Complicité familiale capturée dans un moment naturel.",
        category: "portraits",
        location: "Parc des Buttes-Chaumont",
        equipment: "Canon EOS R5, 24-70mm f/2.8",
        date: "8 Mai 2024",
        featured: true
    },
    {
        id: 12,
        src: "https://images.unsplash.com/photo-1465495976277-4387d4b0e4a6?w=800&h=600&fit=crop",
        title: "Cérémonie en Plein Air",
        description: "Mariage champêtre dans un cadre naturel exceptionnel.",
        category: "mariages",
        location: "Dordogne, France",
        equipment: "Nikon D780, 35mm f/1.4",
        date: "30 Juin 2024",
        featured: true
    }
];

document.addEventListener('DOMContentLoaded', function() {
    initializeGallery();
    initializeEventListeners();
    initializeProtection();
    
    setTimeout(() => {
        hideLoadingScreen();
    }, 1500);
});

function initializeGallery() {
    allImages = [...galleryData];
    filteredImages = [...allImages];
    loadImages();
    updateImageCounter();
}

function loadImages() {
    const galleryGrid = document.getElementById('gallery-grid');
    const imagesToShow = filteredImages.slice(0, totalImagesToLoad);
    
    galleryGrid.innerHTML = '';
    
    imagesToShow.forEach((image, index) => {
        const imageElement = createImageElement(image, index);
        galleryGrid.appendChild(imageElement);
    });
    
    updateLoadMoreButton();
}

function createImageElement(image, index) {
    const div = document.createElement('div');
    div.className = 'gallery-item';
    div.dataset.category = image.category;
    div.dataset.index = index;
    
    div.innerHTML = `
        <img src="${image.src}" alt="${image.title}" class="protected-image" loading="lazy">
        <div class="gallery-overlay">
            <div class="gallery-info">
                <h3>${image.title}</h3>
                <p>${image.description}</p>
            </div>
        </div>
        <div class="gallery-category">${getCategoryName(image.category)}</div>
    `;
    div.addEventListener('click', () => openImageModal(index));
    
    return div;
}

function getCategoryName(category) {
    const categories = {
        'portraits': 'Portrait',
        'mariages': 'Mariage',
        'evenements': 'Événement',
        'nature': 'Nature',
        'urbain': 'Urbain'
    };
    return categories[category] || category;
}

function filterImages(category) {
    currentFilter = category;
    
    if (category === 'all') {
        filteredImages = [...allImages];
    } else {
        filteredImages = allImages.filter(image => image.category === category);
    }
    
    totalImagesToLoad = 12;
    loadImages();
    updateFilterButtons();
}

function updateFilterButtons() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === currentFilter) {
            btn.classList.add('active');
        }
    });
}

function changeView(view) {
    currentView = view;
    const galleryGrid = document.getElementById('gallery-grid');
    
    if (view === 'masonry') {
        galleryGrid.classList.add('masonry');
    } else {
        galleryGrid.classList.remove('masonry');
    }
    
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === view) {
            btn.classList.add('active');
        }
    });
}

function sortImages(sortType) {
    switch (sortType) {
        case 'recent':
            filteredImages.sort((a, b) => new Date(b.date) - new Date(a.date));
            break;
        case 'oldest':
            filteredImages.sort((a, b) => new Date(a.date) - new Date(b.date));
            break;
        case 'name':
            filteredImages.sort((a, b) => a.title.localeCompare(b.title));
            break;
    }
    loadImages();
}

function loadMoreImages() {
    totalImagesToLoad += 12;
    loadImages();
}

function updateLoadMoreButton() {
    const loadMoreBtn = document.getElementById('load-more');
    if (totalImagesToLoad >= filteredImages.length) {
        loadMoreBtn.style.display = 'none';
    } else {
        loadMoreBtn.style.display = 'inline-block';
    }
}

function openImageModal(index) {
    console.log('Tentative d\'ouverture modal, isModalOpen:', isModalOpen);
    console.log('Index demandé:', index, 'Images filtrées disponibles:', filteredImages.length);
    
    if (isModalOpen) {
        console.log('Modal déjà ouverte, abandon');
        return;
    }
    
    // Vérifier que l'index est valide
    if (index >= filteredImages.length || index < 0) {
        console.error('Index invalide:', index);
        return;
    }
    
    isModalOpen = true;
    console.log('Ouverture modal, isModalOpen maintenant:', isModalOpen);
    
    currentImageIndex = index;
    const modal = document.getElementById('image-modal');
    const image = filteredImages[index];
    
    console.log('Image à afficher:', image);
    
    // Attendre que le modal soit visible avant de charger l'image
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Utiliser un petit délai pour s'assurer que le DOM est prêt
    setTimeout(() => {
        const modalImage = document.getElementById('modal-image');
        const imageTitle = document.getElementById('image-title');
        const imageLocation = document.getElementById('image-location');
        const imageEquipment = document.getElementById('image-equipment');
        const imageDate = document.getElementById('image-date');
        const imageDescription = document.getElementById('image-description');
        
        console.log('Éléments DOM trouvés:', {
            modalImage: !!modalImage,
            imageTitle: !!imageTitle,
            imageLocation: !!imageLocation,
            imageEquipment: !!imageEquipment,
            imageDate: !!imageDate,
            imageDescription: !!imageDescription
        });
        
        if (modalImage) {
            modalImage.src = image.src;
            modalImage.alt = image.title;
            console.log('Image src définie:', image.src);
        }
        
        if (imageTitle) imageTitle.textContent = image.title;
        if (imageLocation) imageLocation.textContent = image.location || 'Non spécifié';
        if (imageEquipment) imageEquipment.textContent = image.equipment || 'Non spécifié';
        if (imageDate) imageDate.textContent = image.date || 'Non spécifié';
        if (imageDescription) imageDescription.textContent = image.description || '';
        
        updateImageCounter();
        updateNavigationButtons();
        
        if (!galleryManager.isAdmin) {
            document.querySelectorAll('.modal-image').forEach(img => {
                img.classList.add('protected-image');
            });
        }
    }, 10);
}

document.addEventListener('click', function(e) {
    // Fermer le modal avec la croix
    if (e.target.classList.contains('close-modal') || e.target.closest('.close-modal')) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Clic sur fermer modal');
        closeImageModal();
        return;
    }
    
    // Fermer le modal en cliquant sur le backdrop
    if (e.target.classList.contains('modal-backdrop')) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Clic sur backdrop');
        closeImageModal();
        return;
    }
    
    // Navigation dans le modal
    if (e.target.classList.contains('prev-btn') || e.target.closest('.prev-btn')) {
        e.preventDefault();
        e.stopPropagation();
        navigateImage('prev');
        return;
    }
    
    if (e.target.classList.contains('next-btn') || e.target.closest('.next-btn')) {
        e.preventDefault();
        e.stopPropagation();
        navigateImage('next');
        return;
    }
});

function closeImageModal() {
    const modal = document.getElementById('image-modal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.documentElement.style.overflow = '';
    isModalOpen = false;
    modal.offsetHeight;
    
    console.log('Modal fermée correctement, isModalOpen:', isModalOpen);
}

function initializeModalEventListeners() {
    const modal = document.getElementById('image-modal');
    const closeBtn = document.getElementById('close-modal');
    const backdrop = modal.querySelector('.modal-backdrop');
    
    // Event listeners directs pour plus de fiabilité
    closeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Fermeture via bouton direct');
        closeImageModal();
    });
    
    backdrop.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Fermeture via backdrop direct');
        closeImageModal();
    });
    
    // Navigation
    modal.querySelector('.prev-btn').addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        navigateImage('prev');
    });
    
    modal.querySelector('.next-btn').addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        navigateImage('next');
    });
}

function navigateImage(direction) {
    if (direction === 'next') {
        currentImageIndex = (currentImageIndex + 1) % filteredImages.length;
    } else {
        currentImageIndex = (currentImageIndex - 1 + filteredImages.length) % filteredImages.length;
    }
    
    const image = filteredImages[currentImageIndex];
    document.getElementById('modal-image').src = image.src;
    document.getElementById('image-title').textContent = image.title;
    document.getElementById('image-location').textContent = image.location;
    document.getElementById('image-equipment').textContent = image.equipment;
    document.getElementById('image-date').textContent = image.date;
    document.getElementById('image-description').textContent = image.description;
    
    updateImageCounter();
    updateNavigationButtons();
}

function updateImageCounter() {
    document.getElementById('current-image').textContent = currentImageIndex + 1;
    document.getElementById('total-images').textContent = filteredImages.length;
}

function updateNavigationButtons() {
    const prevBtn = document.querySelector('.prev-btn');
    const nextBtn = document.querySelector('.next-btn');
    
    prevBtn.disabled = currentImageIndex === 0;
    nextBtn.disabled = currentImageIndex === filteredImages.length - 1;
}

function initializeEventListeners() {
    // Initialiser les event listeners du modal
    initializeModalEventListeners();
    
    // Filtres
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            filterImages(btn.dataset.filter);
        });
    });
    
    // Vues
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            changeView(btn.dataset.view);
        });
    });
    
    // Tri
    document.getElementById('sort-select').addEventListener('change', (e) => {
        sortImages(e.target.value);
    });
    
    // Charger plus
    document.getElementById('load-more').addEventListener('click', loadMoreImages);
    
    // Navigation mobile
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('nav-menu');
    
    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
        });
    });
    
    // Retour en haut
    const backToTop = document.getElementById('back-to-top');
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            backToTop.classList.add('visible');
        } else {
            backToTop.classList.remove('visible');
        }
    });
    
    backToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Événements clavier
    document.addEventListener('keydown', (e) => {
        if (document.getElementById('image-modal').classList.contains('active')) {
            switch (e.key) {
                case 'Escape':
                    closeImageModal();
                    break;
                case 'ArrowLeft':
                    navigateImage('prev');
                    break;
                case 'ArrowRight':
                    navigateImage('next');
                    break;
            }
        }
    });
}


function initializeProtection() {
    if (!galleryManager.isAdmin) {
        document.addEventListener('contextmenu', function(e) {
            if (e.target.tagName === 'IMG') {
                e.preventDefault();
                showProtectionAlert();
            }
        });
        document.addEventListener('dragstart', function(e) {
            if (e.target.tagName === 'IMG') {
                e.preventDefault();
            }
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'PrintScreen' || 
                (e.ctrlKey && e.shiftKey && e.key === 'I') || 
                (e.ctrlKey && e.key === 's')) {
                e.preventDefault();
                showProtectionAlert();
            }
        });
    }
}

function showProtectionAlert() {
    const overlay = document.getElementById('protection-overlay');
    overlay.style.background = 'rgba(231, 76, 60, 0.3)';
    setTimeout(() => {
        overlay.style.background = 'transparent';
    }, 300);
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.classList.add('hidden');
    setTimeout(() => {
        loadingScreen.style.display = 'none';
    }, 500);
}

function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

function observeElements() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });
    
    document.querySelectorAll('.gallery-item').forEach(item => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(30px)';
        observer.observe(item);
    });
}

function enableAdminMode() {
    isAdminMode = true;
    console.log('Mode administrateur activé - Protections désactivées');
}

function disableAdminMode() {
    isAdminMode = false;
    console.log('Mode administrateur désactivé - Protections activées');
}
function searchImages(query) {
    if (!query) {
        filteredImages = [...allImages];
    } else {
        filteredImages = allImages.filter(image => 
            image.title.toLowerCase().includes(query.toLowerCase()) ||
            image.description.toLowerCase().includes(query.toLowerCase()) ||
            image.location.toLowerCase().includes(query.toLowerCase())
        );
    }
    loadImages();
}

window.galleryFunctions = {
    enableAdminMode,
    disableAdminMode,
    searchImages,
    filterImages,
    changeView,
    sortImages
};

window.addEventListener('storage', (event) => {
    if (event.key === 'uploadedImages') {
        galleryManager.loadAllImages();
        loadImages();
    }
});