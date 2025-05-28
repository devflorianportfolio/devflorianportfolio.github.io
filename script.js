class SecurityManager {
    constructor() {
        this.logs = [];
        this.suspiciousActivityCount = 0;
        this.blockedUntilKey = 'portfolio_blocked_until';
        this.blockStateKey = 'portfolio_block_state';
        this.sessionKey = 'portfolio_session_id';
        this.fingerprintKey = 'portfolio_fingerprint';
        this.blockDuration = 10 * 60 * 1000; // 10 minutes
        this.adminIPs = ['192.168.10.27', '86.238.222.34']; // IPs autorisées
        this.isAdmin = false;
        this.userInfo = {};
        this.fingerprint = null;
        this.sessionId = null;
        this.isBlocking = false;
        
        this.init();
    }

    async init() {
        // Vérification immédiate du blocage AVANT tout le reste
        if (this.checkBlockStatus()) {
            return; // Stop l'initialisation si bloqué
        }

        await this.checkAdminStatus();
        await this.collectExtendedInfo();
        this.setupProtections();
        this.monitorActivity();
        this.setupRefreshProtection();
        this.sendInitialLog();
    }

    async checkAdminStatus() {
        try {
            const ip = await this.getIP();
            this.isAdmin = this.adminIPs.includes(ip);
            if (this.isAdmin) {
                console.log("Mode admin activé - Protections désactivées");
                // Nettoyer le blocage pour l'admin
                this.clearBlockage();
            }
        } catch (e) {
            console.error("Erreur vérification admin:", e);
            this.isAdmin = false;
        }
    }

    async collectExtendedInfo() {
        try {
            this.userInfo = {
                // Basic info
                timestamp: new Date().toISOString(),
                ip: await this.getIP(),
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language,
                languages: navigator.languages,
                
                // Screen info
                screenResolution: `${screen.width}x${screen.height}`,
                colorDepth: screen.colorDepth,
                pixelDepth: screen.pixelDepth,
                
                // Device capabilities
                cookieEnabled: navigator.cookieEnabled,
                javaEnabled: navigator.javaEnabled?.(),
                hardwareConcurrency: navigator.hardwareConcurrency,
                maxTouchPoints: navigator.maxTouchPoints,
                webdriver: navigator.webdriver,
                
                // Network info
                connection: navigator.connection ? {
                    effectiveType: navigator.connection.effectiveType,
                    downlink: navigator.connection.downlink,
                    rtt: navigator.connection.rtt,
                    saveData: navigator.connection.saveData
                } : null,
                
                // Time/date
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                timezoneOffset: new Date().getTimezoneOffset(),
                
                // Location data
                geoLocation: await this.getGeolocation(),
                ipInfo: await this.getIPInfo(),
                
                // Advanced fingerprinting
                canvasFingerprint: this.getCanvasFingerprint(),
                webglInfo: this.getWebGLInfo(),
                audioContext: await this.getAudioFingerprint(),
                installedFonts: await this.getFontsList(),
                plugins: Array.from(navigator.plugins).map(p => p.name),
                mimeTypes: Array.from(navigator.mimeTypes).map(m => m.type),
                
                // Storage info
                localStorage: !!window.localStorage,
                sessionStorage: !!window.sessionStorage,
                indexedDB: !!window.indexedDB,
                
                // Performance
                deviceMemory: navigator.deviceMemory,
                performance: performance.memory ? {
                    jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
                    totalJSHeapSize: performance.memory.totalJSHeapSize,
                    usedJSHeapSize: performance.memory.usedJSHeapSize
                } : null
            };
            
            this.fingerprint = this.generateFingerprint();
            this.userInfo.fingerprint = this.fingerprint;
            
            // Sauvegarder le fingerprint pour tracking
            localStorage.setItem(this.fingerprintKey, this.fingerprint);
            
        } catch (e) {
            console.error("Erreur collecte infos:", e);
        }
    }

    /* === MÉTHODES DE COLLECTE D'INFORMATIONS === */
    
    async getIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (e) {
            return "unknown";
        }
    }

    async getIPInfo() {
        try {
            const response = await fetch('https://ipapi.co/json/');
            return await response.json();
        } catch (e) {
            return { error: e.message };
        }
    }

    async getGeolocation() {
        return new Promise(resolve => {
            if (!navigator.geolocation) {
                resolve({ error: "unsupported" });
                return;
            }
            
            navigator.geolocation.getCurrentPosition(
                pos => resolve({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy
                }),
                err => resolve({ error: err.message }),
                { timeout: 5000 }
            );
        });
    }

    getCanvasFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = "top";
            ctx.font = "14px 'Arial'";
            ctx.fillStyle = "#f60";
            ctx.fillRect(125,1,62,20);
            ctx.fillStyle = "#069";
            ctx.fillText("Fingerprint", 2, 15);
            ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
            ctx.fillText("Fingerprint", 4, 17);
            return canvas.toDataURL().hashCode();
        } catch (e) {
            return "error";
        }
    }

    getWebGLInfo() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) return { error: "no-webgl" };
            
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            return {
                vendor: gl.getParameter(debugInfo?.UNMASKED_VENDOR_WEBGL || 'unknown'),
                renderer: gl.getParameter(debugInfo?.UNMASKED_RENDERER_WEBGL || 'unknown'),
                maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
                shaderPrecisionFormat: gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    async getAudioFingerprint() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const analyser = audioContext.createAnalyser();
            
            oscillator.connect(analyser);
            analyser.connect(audioContext.destination);
            oscillator.start();
            
            const freqData = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(freqData);
            oscillator.stop();
            
            return Array.from(freqData).join(',');
        } catch (e) {
            return "error";
        }
    }

    async getFontsList() {
        try {
            if (!document.fonts) return "font-api-not-supported";
            await document.fonts.ready;
            
            const testFonts = [
                'Arial', 'Arial Black', 'Courier New', 'Comic Sans MS',
                'Georgia', 'Impact', 'Tahoma', 'Times New Roman',
                'Verdana', 'Webdings', 'Wingdings'
            ];
            
            const available = [];
            for (const font of testFonts) {
                if (document.fonts.check(`12px "${font}"`)) {
                    available.push(font);
                }
            }
            
            return available;
        } catch (e) {
            return "error";
        }
    }

    generateFingerprint() {
        const components = [
            navigator.userAgent,
            navigator.platform,
            screen.width,
            screen.height,
            screen.colorDepth,
            new Date().getTimezoneOffset(),
            navigator.languages?.join(','),
            this.userInfo?.canvasFingerprint,
            this.userInfo?.webglInfo?.vendor,
            this.userInfo?.webglInfo?.renderer
        ].filter(Boolean).join('|');
        
        return this.hashString(components);
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return 'fp-' + Math.abs(hash).toString(36);
    }

    /* === SYSTÈME DE PROTECTION ANTI-REFRESH === */
    
    setupRefreshProtection() {
        if (this.isAdmin) return;

        // Générer un ID de session unique
        this.sessionId = this.generateSessionId();
        
        // Vérifier les tentatives de refresh/contournement
        this.detectRefreshAttempt();
        
        // Empêcher le refresh/F5
        window.addEventListener('beforeunload', (e) => {
            if (this.isBlocked()) {
                e.preventDefault();
                e.returnValue = 'Vous êtes bloqué pour violation des conditions.';
                
                // Enregistrer la tentative de refresh
                this.logSuspiciousActivity('Tentative de refresh pendant blocage');
                
                // Prolonger le blocage en cas de tentative
                this.extendBlockage();
                
                return 'Vous êtes bloqué pour violation des conditions.';
            }
        });

        // Détecter les tentatives de navigation
        window.addEventListener('pagehide', () => {
            if (this.isBlocked()) {
                this.logSuspiciousActivity('Tentative de navigation pendant blocage');
                this.markRefreshAttempt();
            }
        });

        // Surveiller les changements d'URL
        let currentUrl = window.location.href;
        setInterval(() => {
            if (window.location.href !== currentUrl) {
                currentUrl = window.location.href;
                if (this.isBlocked()) {
                    this.logSuspiciousActivity('Tentative de changement URL pendant blocage');
                    this.blockUser(true);
                }
            }
        }, 100);

        // Empêcher les raccourcis de navigation
        document.addEventListener('keydown', (e) => {
            if (this.isBlocked()) {
                const blockedKeys = [
                    'F5', 'F11', 'F12',
                    e.ctrlKey && ['r', 'l', 't', 'n', 'w'].includes(e.key.toLowerCase()),
                    e.altKey && ['F4', 'Tab'].includes(e.key),
                    e.ctrlKey && e.shiftKey && ['r', 't', 'n'].includes(e.key.toLowerCase())
                ];
                
                if (blockedKeys.some(Boolean)) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.logSuspiciousActivity(`Tentative raccourci bloqué: ${e.key}`);
                    this.showViolationWarning();
                    return false;
                }
            }
        });
    }

    generateSessionId() {
        return 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    detectRefreshAttempt() {
        const lastSession = localStorage.getItem(this.sessionKey);
        const blockState = localStorage.getItem(this.blockStateKey);
        
        if (blockState === 'active' && lastSession && lastSession !== this.sessionId) {
            // Tentative de refresh détectée pendant un blocage
            this.logSuspiciousActivity('Tentative de contournement par refresh détectée');
            this.extendBlockage();
            this.blockUser(true);
            return;
        }
        
        // Sauvegarder la session actuelle
        localStorage.setItem(this.sessionKey, this.sessionId);
    }

    markRefreshAttempt() {
        localStorage.setItem(this.blockStateKey, 'active');
        localStorage.setItem('refresh_attempt_time', Date.now().toString());
    }

    extendBlockage() {
        const currentBlockTime = localStorage.getItem(this.blockedUntilKey);
        const newBlockTime = Date.now() + this.blockDuration;
        
        if (currentBlockTime) {
            // Ajouter 5 minutes supplémentaires pour tentative de contournement
            const extendedTime = Math.max(parseInt(currentBlockTime), newBlockTime) + (5 * 60 * 1000);
            localStorage.setItem(this.blockedUntilKey, extendedTime.toString());
        } else {
            localStorage.setItem(this.blockedUntilKey, newBlockTime.toString());
        }
    }

    /* === SYSTÈME DE PROTECTION GÉNÉRAL === */
    
    setupProtections() {
        if (this.isAdmin) return;
        
        // Protection clic droit
        document.addEventListener('contextmenu', e => {
            if (e.target.tagName === 'IMG') {
                e.preventDefault();
                this.logSuspiciousActivity('Tentative clic droit sur image');
                this.showProtectionAlert();
            }
        });

        // Protection glisser-déposer
        document.addEventListener('dragstart', e => {
            if (e.target.tagName === 'IMG') {
                e.preventDefault();
                this.logSuspiciousActivity('Tentative drag image');
                this.showProtectionAlert();
            }
        });

        // Protection raccourcis clavier
        document.addEventListener('keydown', e => {
            if (this.isBlocked()) return; // Géré par setupRefreshProtection
            
            const blockedShortcuts = [
                e.key === 'F12',
                e.key === 'F5',
                e.ctrlKey && e.key === 'r',
                e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase()),
                e.ctrlKey && ['u', 's', 'p'].includes(e.key.toLowerCase())
            ];
            
            if (blockedShortcuts.some(Boolean)) {
                e.preventDefault();
                this.logSuspiciousActivity(`Raccourci bloqué: ${e.key}`);
                this.showProtectionAlert();
            }
        });

        // Protection outils de développement
        this.setupDevToolsDetection();
        
        // Protection changement d'onglet
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && !this.isBlocked()) {
                this.logActivity('Changement onglet détecté');
            }
        });
    }

    setupDevToolsDetection() {
        // Méthode 1: Différence de taille fenêtre
        setInterval(() => {
            if (this.isBlocked()) return;
            
            const threshold = 160;
            const widthDiff = window.outerWidth - window.innerWidth;
            const heightDiff = window.outerHeight - window.innerHeight;
            
            if (widthDiff > threshold || heightDiff > threshold) {
                this.logSuspiciousActivity('DevTools détecté (méthode taille)');
                this.handleViolation();
            }
        }, 1000);
        
        // Méthode 2: Debugger statement
        const debuggerCheck = () => {
            if (this.isBlocked()) return;
            
            const start = Date.now();
            debugger;
            if (Date.now() - start > 100) {
                this.logSuspiciousActivity('Debugger détecté');
                this.handleViolation();
            }
        };
        setInterval(debuggerCheck, 5000);
    }

    /* === SYSTÈME DE BLOCAGE === */
    
    checkBlockStatus() {
        const blockedUntil = localStorage.getItem(this.blockedUntilKey);
        if (blockedUntil && Date.now() < parseInt(blockedUntil)) {
            this.blockUser(true);
            return true;
        } else if (blockedUntil && Date.now() >= parseInt(blockedUntil)) {
            // Temps écoulé, nettoyer le blocage
            this.clearBlockage();
            return false;
        }
        return false;
    }

    isBlocked() {
        const blockedUntil = localStorage.getItem(this.blockedUntilKey);
        return blockedUntil && Date.now() < parseInt(blockedUntil);
    }

    clearBlockage() {
        localStorage.removeItem(this.blockedUntilKey);
        localStorage.removeItem(this.blockStateKey);
        localStorage.removeItem('refresh_attempt_time');
    }

    blockUser(initialCheck = false) {
        if (this.isBlocking) return; // Éviter les blocages multiples
        this.isBlocking = true;
        
        const blockedUntil = Date.now() + this.blockDuration;
        localStorage.setItem(this.blockedUntilKey, blockedUntil.toString());
        localStorage.setItem(this.blockStateKey, 'active');

        // Vider complètement la page et empêcher toute interaction
        document.documentElement.innerHTML = '';
        document.body = document.createElement('body');
        document.head = document.createElement('head');

        // Créer l'écran de blocage
        const blockScreen = document.createElement('div');
        blockScreen.id = 'block-screen';
        blockScreen.innerHTML = `
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                #block-screen {
                    position: fixed !important;
                    top: 0 !important; left: 0 !important; 
                    right: 0 !important; bottom: 0 !important;
                    width: 100vw !important; height: 100vh !important;
                    background: #000 !important;
                    color: #fff !important;
                    display: flex !important;
                    flex-direction: column !important;
                    align-items: center !important;
                    justify-content: center !important;
                    text-align: center !important;
                    z-index: 2147483647 !important;
                    font-family: Arial, sans-serif !important;
                    padding: 20px !important;
                    overflow: hidden !important;
                }
                .block-title {
                    color: #e74c3c !important;
                    font-size: 2.5em !important;
                    margin-bottom: 20px !important;
                    text-shadow: 0 0 10px #e74c3c !important;
                }
                .block-info {
                    background: #222 !important;
                    padding: 15px !important;
                    border-radius: 5px !important;
                    max-width: 500px !important;
                    word-break: break-all !important;
                    margin: 20px 0 !important;
                }
                .warning-text {
                    color: #ff6b6b !important;
                    font-weight: bold !important;
                    margin: 20px 0 !important;
                    font-size: 1.1em !important;
                }
            </style>
            <div class="block-title">🚫 ACCÈS DÉFINITIVEMENT BLOQUÉ</div>
            <p style="font-size: 1.2em; margin-bottom: 10px;">
                Violations multiples des conditions d'utilisation détectées.
            </p>
            <p style="margin-bottom: 30px;">
                Blocage actif jusqu'à : <span id="block-timer" style="font-weight: bold; color: #e74c3c;">${new Date(blockedUntil).toLocaleTimeString()}</span>
            </p>
            
            <div class="block-info">
                <p><strong>🆔 Identifiant unique:</strong> <span id="block-fingerprint">Chargement...</span></p>
                <p><strong>📍 Adresse IP:</strong> <span id="block-ip">Chargement...</span></p>
                <p><strong>⚠️ Raison:</strong> ${initialCheck ? 'Tentative de contournement par refresh' : `Activités suspectes (${this.suspiciousActivityCount})`}</p>
                <p><strong>🕐 Session:</strong> ${this.sessionId}</p>
            </div>
            
            <div class="warning-text">
                ⚠️ TOUTE TENTATIVE DE CONTOURNEMENT PROLONGERA LE BLOCAGE ⚠️
            </div>
            
            <p style="margin-top: 20px; font-size: 0.9em; color: #aaa;">
                Refresh, navigation ou fermeture détectés et enregistrés.<br>
                Système de sécurité actif et surveillance continue.
            </p>
        `;

        document.body.appendChild(blockScreen);

        // Empêcher TOUTE interaction
        const preventAll = (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
            return false;
        };
        
        const events = [
            'keydown', 'keyup', 'keypress',
            'mousedown', 'mouseup', 'click', 'dblclick',
            'touchstart', 'touchend', 'touchmove',
            'contextmenu', 'selectstart', 'dragstart',
            'beforeunload', 'unload', 'pagehide'
        ];
        
        events.forEach(evt => {
            document.addEventListener(evt, preventAll, { 
                passive: false, 
                capture: true 
            });
            window.addEventListener(evt, preventAll, { 
                passive: false, 
                capture: true 
            });
        });

        // Surveillance continue des tentatives de manipulation
        this.setupBlockSurveillance();
        
        // Récupérer et afficher les infos
        this.displayBlockDetails();
        
        // Mettre à jour le timer
        this.updateBlockTimer();
        
        // Envoyer l'alerte
        this.sendBlockAlert(initialCheck);
    }

    setupBlockSurveillance() {
        // Surveiller les tentatives de modification DOM
        if (window.MutationObserver) {
            const observer = new MutationObserver(() => {
                const blockScreen = document.getElementById('block-screen');
                if (!blockScreen && this.isBlocked()) {
                    // Tentative de suppression de l'écran de blocage
                    this.logSuspiciousActivity('Tentative de suppression écran blocage');
                    this.extendBlockage();
                    location.reload();
                }
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true
            });
        }

        // Surveiller les tentatives de console
        setInterval(() => {
            if (this.isBlocked()) {
                try {
                    console.clear();
                    console.log('🚫 Accès console bloqué - Violation enregistrée');
                } catch (e) {}
            }
        }, 1000);
    }

    async displayBlockDetails() {
        try {
            const fpElement = document.getElementById('block-fingerprint');
            const ipElement = document.getElementById('block-ip');
            
            if (fpElement) fpElement.textContent = this.fingerprint || 'Génération...';
            if (ipElement) ipElement.textContent = this.userInfo?.ip || await this.getIP();
        } catch (e) {
            console.error("Erreur affichage détails blocage:", e);
        }
    }

    updateBlockTimer() {
        const timerElement = document.getElementById('block-timer');
        if (!timerElement) return;

        const update = () => {
            const remaining = parseInt(localStorage.getItem(this.blockedUntilKey)) - Date.now();
            
            if (remaining <= 0) {
                this.clearBlockage();
                location.reload();
                return;
            }

            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            timerElement.textContent = `${minutes}m ${seconds}s`;
        };

        update();
        const interval = setInterval(() => {
            if (!this.isBlocked()) {
                clearInterval(interval);
                return;
            }
            update();
        }, 1000);
    }

    showViolationWarning() {
        if (document.getElementById('violation-warning')) return;
        
        const warning = document.createElement('div');
        warning.id = 'violation-warning';
        warning.style.cssText = `
            position: fixed !important;
            top: 50% !important; left: 50% !important;
            transform: translate(-50%, -50%) !important;
            background: #e74c3c !important;
            color: white !important;
            padding: 20px !important;
            border-radius: 10px !important;
            z-index: 2147483646 !important;
            font-family: Arial, sans-serif !important;
            text-align: center !important;
            box-shadow: 0 0 20px rgba(231, 76, 60, 0.8) !important;
        `;
        warning.innerHTML = `
            <h3>⚠️ VIOLATION DÉTECTÉE ⚠️</h3>
            <p>Tentative de contournement enregistrée</p>
            <p><strong>Temps de blocage prolongé</strong></p>
        `;
        
        document.body.appendChild(warning);
        
        setTimeout(() => {
            if (warning.parentNode) {
                warning.parentNode.removeChild(warning);
            }
        }, 3000);
    }

    /* === JOURNALISATION ET ALERTES === */
    
    logActivity(activity) {
        const logEntry = {
            type: 'ACTIVITY',
            activity: activity,
            timestamp: new Date().toISOString(),
            userInfo: this.userInfo,
            url: window.location.href,
            referrer: document.referrer,
            sessionId: this.sessionId
        };
        
        this.logs.push(logEntry);
        this.sendToDiscord(logEntry);
    }

    logSuspiciousActivity(activity) {
        if (this.isAdmin) return;
        
        this.suspiciousActivityCount++;
        
        const logEntry = {
            type: 'SUSPICIOUS',
            activity: activity,
            timestamp: new Date().toISOString(),
            userInfo: this.userInfo,
            url: window.location.href,
            referrer: document.referrer,
            count: this.suspiciousActivityCount,
            sessionId: this.sessionId
        };
        
        this.logs.push(logEntry);
        this.sendToDiscord(logEntry);
        
        if (this.suspiciousActivityCount >= 3) {
            this.handleViolation();
        }
    }

    sendInitialLog() {
        const logEntry = {
            type: 'VISIT',
            activity: 'Nouvelle visite détectée',
            timestamp: new Date().toISOString(),
            userInfo: this.userInfo,
            url: window.location.href,
            referrer: document.referrer,
            sessionId: this.sessionId
        };
        
        this.logs.push(logEntry);
        this.sendToDiscord(logEntry);
    }

    async sendBlockAlert(initialCheck) {
        const embed = {
            title: '🚨 BLOCAGE RENFORCÉ ACTIVÉ',
            color: 0xFF0000,
            timestamp: new Date().toISOString(),
            fields: [
                {
                    name: '🆔 Fingerprint',
                    value: this.fingerprint || 'Non disponible',
                    inline: true
                },
                {
                    name: '📌 IP',
                    value: this.userInfo?.ip || 'Chargement...',
                    inline: true
                },
                {
                    name: '🌍 Localisation',
                    value: this.userInfo?.ipInfo?.country || 'Inconnue',
                    inline: true
                },
                {
                    name: '💻 Session ID',
                    value: this.sessionId,
                    inline: true
                },
                {
                    name: '🖥️ Plateforme',
                    value: `${this.userInfo?.platform} - ${this.userInfo?.screenResolution}`,
                    inline: true
                },
                {
                    name: '🛡️ Raison',
                    value: initialCheck ? '🔄 Tentative de contournement par refresh' : `⚠️ Activités suspectes (${this.suspiciousActivityCount})`,
                    inline: false
                },
                {
                    name: '⏱️ Durée',
                    value: '10 minutes (extensible si contournement)',
                    inline: true
                },
                {
                    name: '🔗 URL',
                    value: window.location.href,
                    inline: true
                },
                {
                    name: '🚨 Statut',
                    value: '**PROTECTION ANTI-REFRESH ACTIVE**',
                    inline: false
                }
            ]
        };
        
        await this.sendToDiscord({ embeds: [embed], content: '@here **ALERTE SÉCURITÉ MAXIMALE**' }, true);
    }

    async sendToDiscord(data, isUrgent = false) {
        const webhookUrl = 'https://discord.com/api/webhooks/1376614986662543430/drlZfgzVNei5tVbh_PcFFRu5Yp6Nq4KHNgNR4VxXljVV4rZmZ-nmZeWJsZUKAkJqadB3';
        
        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...data,
                    content: isUrgent ? '@here **Alerte sécurité maximale**' : data.content
                })
            });
        } catch (error) {
            console.error('Erreur envoi Discord:', error);
        }
    }

    /* === MÉTHODES UTILITAIRES === */
    
    showProtectionAlert() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed !important;
            top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
            background: rgba(231, 76, 60, 0.3) !important;
            z-index: 9998 !important;
            pointer-events: none !important;
            transition: background 0.3s !important;
        `;
        document.body.appendChild(overlay);
        
        setTimeout(() => {
            overlay.style.background = 'transparent';
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 300);
        }, 500);
    }

    handleViolation() {
        if (this.isBlocked()) return;
        this.blockUser();
    }

    monitorActivity() {
        if (this.isAdmin) return;

        // Surveillance des tentatives de copie
        document.addEventListener('copy', () => {
            this.logSuspiciousActivity('Tentative de copie détectée');
        });

        // Surveillance print
        window.addEventListener('beforeprint', (e) => {
            e.preventDefault();
            this.logSuspiciousActivity('Tentative d\'impression détectée');
            this.showProtectionAlert();
        });

        // Surveillance focus/blur pour détecter les changements d'onglets
        let tabSwitchCount = 0;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                tabSwitchCount++;
                if (tabSwitchCount > 3) {
                    this.logSuspiciousActivity('Changements d\'onglets suspects');
                }
            }
        });

        // Surveillance des tentatives de sélection de texte
        document.addEventListener('selectstart', (e) => {
            if (e.target.tagName === 'IMG' || e.target.classList.contains('protected')) {
                e.preventDefault();
                this.logSuspiciousActivity('Tentative de sélection contenu protégé');
            }
        });

        // Surveillance resize pour détecter DevTools
        let resizeCount = 0;
        window.addEventListener('resize', () => {
            resizeCount++;
            if (resizeCount > 5) {
                this.logSuspiciousActivity('Redimensionnements suspects (DevTools?)');
                resizeCount = 0; // Reset pour éviter le spam
            }
        });
    }

    // Méthode pour débloquer manuellement (admin uniquement)
    forceUnblock() {
        if (!this.isAdmin) {
            console.error('Action non autorisée');
            return false;
        }
        
        this.clearBlockage();
        console.log('Blocage supprimé par admin');
        location.reload();
        return true;
    }

    // Méthode pour obtenir le statut détaillé
    getStatus() {
        return {
            isBlocked: this.isBlocked(),
            isAdmin: this.isAdmin,
            suspiciousCount: this.suspiciousActivityCount,
            fingerprint: this.fingerprint,
            sessionId: this.sessionId,
            blockedUntil: localStorage.getItem(this.blockedUntilKey),
            logs: this.logs.slice(-10) // Derniers 10 logs
        };
    }

    // Méthode pour obtenir tous les logs
    getLogs() {
        return this.logs;
    }

    // Extension de String pour le hash
    hashCode() {
        let hash = 0;
        if (this.length === 0) return hash;
        for (let i = 0; i < this.length; i++) {
            const char = this.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash;
    }
}

// Extension String pour hashCode si pas déjà définie
if (!String.prototype.hashCode) {
    String.prototype.hashCode = function() {
        let hash = 0;
        if (this.length === 0) return hash;
        for (let i = 0; i < this.length; i++) {
            const char = this.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash;
    };
}

// Initialisation automatique
const securityManager = new SecurityManager();

// Fonctions globales pour debug admin
window.getSecurityStatus = () => securityManager.getStatus();
window.forceUnblock = () => securityManager.forceUnblock();
window.getSecurityLogs = () => securityManager.getLogs();

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