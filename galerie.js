// Galerie JavaScript

// Variables globales
let currentImageIndex = 0;
let filteredImages = [];
let allImages = [];
let currentFilter = 'all';
let currentView = 'grid';
let imagesLoaded = 0;
let totalImagesToLoad = 12;
let isAdminMode = false;

// Configuration des images de la galerie
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

// Initialisation
document.addEventListener('DOMContentLoaded', function() {
    initializeGallery();
    initializeEventListeners();
    initializeProtection();
    initializeTheme();
    
    // Simuler le chargement
    setTimeout(() => {
        hideLoadingScreen();
    }, 1500);
});

// Initialisation de la galerie
function initializeGallery() {
    allImages = [...galleryData];
    filteredImages = [...allImages];
    loadImages();
    updateImageCounter();
}

// Chargement des images
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

// Création d'un élément image
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
    
    // Ajouter l'événement de clic
    div.addEventListener('click', () => openImageModal(index));
    
    return div;
}

// Obtenir le nom de la catégorie
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

// Filtrage des images
function filterImages(category) {
    currentFilter = category;
    
    if (category === 'all') {
        filteredImages = [...allImages];
    } else {
        filteredImages = allImages.filter(image => image.category === category);
    }
    
    // Reset du compteur d'images chargées
    totalImagesToLoad = 12;
    loadImages();
    updateFilterButtons();
}

// Mise à jour des boutons de filtre
function updateFilterButtons() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === currentFilter) {
            btn.classList.add('active');
        }
    });
}

// Changement de vue
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

// Tri des images
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

// Charger plus d'images
function loadMoreImages() {
    totalImagesToLoad += 12;
    loadImages();
}

// Mise à jour du bouton "Charger plus"
function updateLoadMoreButton() {
    const loadMoreBtn = document.getElementById('load-more');
    if (totalImagesToLoad >= filteredImages.length) {
        loadMoreBtn.style.display = 'none';
    } else {
        loadMoreBtn.style.display = 'inline-block';
    }
}

// Ouverture de la modal d'image
function openImageModal(index) {
    if (!isAdminMode) return; // Protection contre l'ouverture si pas en mode admin
    
    currentImageIndex = index;
    const modal = document.getElementById('image-modal');
    const image = filteredImages[index];
    
    document.getElementById('modal-image').src = image.src;
    document.getElementById('image-title').textContent = image.title;
    document.getElementById('image-location').textContent = image.location;
    document.getElementById('image-equipment').textContent = image.equipment;
    document.getElementById('image-date').textContent = image.date;
    document.getElementById('image-description').textContent = image.description;
    
    updateImageCounter();
    updateNavigationButtons();
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Fermeture de la modal
function closeImageModal() {
    const modal = document.getElementById('image-modal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// Navigation dans les images
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

// Mise à jour du compteur d'images
function updateImageCounter() {
    document.getElementById('current-image').textContent = currentImageIndex + 1;
    document.getElementById('total-images').textContent = filteredImages.length;
}

// Mise à jour des boutons de navigation
function updateNavigationButtons() {
    const prevBtn = document.querySelector('.prev-btn');
    const nextBtn = document.querySelector('.next-btn');
    
    prevBtn.disabled = currentImageIndex === 0;
    nextBtn.disabled = currentImageIndex === filteredImages.length - 1;
}

// Initialisation des écouteurs d'événements
function initializeEventListeners() {
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
    
    // Modal
    document.querySelector('.close-modal').addEventListener('click', closeImageModal);
    document.querySelector('.modal-backdrop').addEventListener('click', closeImageModal);
    document.querySelector('.prev-btn').addEventListener('click', () => navigateImage('prev'));
    document.querySelector('.next-btn').addEventListener('click', () => navigateImage('next'));
    
    // Navigation mobile
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('nav-menu');
    
    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });
    
    // Fermer le menu mobile lors du clic sur un lien
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
        });
    });
    
    // Back to top
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
    
    // Gestion du thème
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    
    // Navigation au clavier
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

// Initialisation de la protection
function initializeProtection() {
    // Protection contre le clic droit
    document.addEventListener('contextmenu', function(e) {
        if (!isAdminMode) {
            e.preventDefault();
            showProtectionAlert();
        }
    });
    
    // Protection contre les raccourcis clavier
    document.addEventListener('keydown', function(e) {
        if (!isAdminMode) {
            // F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
            if (e.key === 'F12' || 
                (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
                (e.ctrlKey && e.key === 'u')) {
                e.preventDefault();
                showProtectionAlert();
            }
        }
    });
    
    // Protection contre la sélection
    document.addEventListener('selectstart', function(e) {
        if (!isAdminMode && e.target.classList.contains('protected-image')) {
            e.preventDefault();
        }
    });
    
    // Protection contre le glisser-déposer
    document.addEventListener('dragstart', function(e) {
        if (!isAdminMode && e.target.classList.contains('protected-image')) {
            e.preventDefault();
        }
    });
}

// Alerte de protection
function showProtectionAlert() {
    // Animation discrète pour indiquer la protection
    const overlay = document.getElementById('protection-overlay');
    overlay.style.background = 'rgba(255, 0, 0, 0.1)';
    setTimeout(() => {
        overlay.style.background = 'transparent';
    }, 200);
}

// Gestion du thème
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const themeIcon = document.querySelector('.theme-icon');
    themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// Masquer l'écran de chargement
function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.classList.add('hidden');
    setTimeout(() => {
        loadingScreen.style.display = 'none';
    }, 500);
}

// Fonctions utilitaires
function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

// Animation d'apparition des éléments
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

// Mode administrateur (pour désactiver les protections)
function enableAdminMode() {
    isAdminMode = true;
    console.log('Mode administrateur activé - Protections désactivées');
}

function disableAdminMode() {
    isAdminMode = false;
    console.log('Mode administrateur désactivé - Protections activées');
}

// Recherche d'images (fonctionnalité bonus)
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

// Export des fonctions pour utilisation globale
window.galleryFunctions = {
    enableAdminMode,
    disableAdminMode,
    searchImages,
    filterImages,
    changeView,
    sortImages
};