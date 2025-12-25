const { app, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const { execFile } = require('child_process');

const START_URL = 'https://wraith.software/';
const HTTP_PORT = 3000;
const WINCTL_PATH = path.join(__dirname, 'python', 'dist', 'winctl.exe');

// ==================== single open ====================

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
    process.exit(0);
}

app.on('second-instance', () => {
    if (isHidden) {
        showChromiumWindow();
        isHidden = false;
    }

    if (page) {
        page.bringToFront().catch(() => {});
    }
});

// ==================== DİL YÖNETİCİSİ ====================
class LanguageManager {
    constructor() {
        this.langDir = path.join(__dirname, 'lang');
        this.config = this.loadConfig();
        this.currentLanguage = this.config.selectedLanguage || this.config.defaultLanguage;
        this.translations = this.loadLanguage(this.currentLanguage);
    }

    loadConfig() {
        const configPath = path.join(this.langDir, 'config.json');
        try {
            const data = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return { defaultLanguage: 'tr', selectedLanguage: 'tr', availableLanguages: ['tr', 'en'] };
        }
    }

    loadLanguage(lang) {
        const langPath = path.join(this.langDir, `${lang}.json`);
        try {
            const data = fs.readFileSync(langPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (lang !== 'tr') {
                return this.loadLanguage('tr');
            }
            return {};
        }
    }

    setLanguage(lang) {
        if (this.config.availableLanguages.includes(lang)) {
            this.currentLanguage = lang;
            this.config.selectedLanguage = lang;
            this.saveConfig();
            this.translations = this.loadLanguage(lang);
            return true;
        }
        return false;
    }

    saveConfig() {
        const configPath = path.join(this.langDir, 'config.json');
        try {
            fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2), 'utf8');
        } catch (error) {
            // Hata durumunda sessiz kal
        }
    }

    get(key, params = {}) {
        const keys = key.split('.');
        let value = this.translations;
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return key;
            }
        }

        if (typeof value === 'string' && params) {
            Object.keys(params).forEach(param => {
                const placeholder = `{${param}}`;
                if (value.includes(placeholder)) {
                    value = value.replace(new RegExp(placeholder, 'g'), params[param]);
                }
            });
        }

        return value;
    }

    getAvailableLanguages() {
        return this.config.availableLanguages.map(lang => ({
            code: lang,
            name: lang === 'tr' ? 'Türkçe' : 'English'
        }));
    }
}

const languageManager = new LanguageManager();

// ==================== GLOBAL DEĞİŞKENLER ====================
let tray = null;
let browser = null;
let page = null;
let server = null;
let initialRefreshInterval = null;
let isHidden = false;
const forceKiosk = false;

let loginCheckInterval = null;
let profileCheckInterval = null;
let loginNotificationSent = false;

let trayMenuTemplate = [
    { id: 'ProfileDef', label: 'Default', click: () => clickAndUpdate('ProfileDef') },
    { id: 'Profile1', label: 'Profile 1', click: () => clickAndUpdate('Profile1') },
    { id: 'Profile2', label: 'Profile 2', click: () => clickAndUpdate('Profile2') },
    { id: 'Profile3', label: 'Profile 3', click: () => clickAndUpdate('Profile3') },
    { id: 'Profile4', label: 'Profile 4', click: () => clickAndUpdate('Profile4') },
    { type: 'separator' },
    { label: languageManager.get('tray.refresh'), click: () => refreshTrayNames() },
    { label: languageManager.get('tray.hideShow'), click: () => toggleChromiumWindow() },
    { type: 'separator' },
    { 
        label: languageManager.get('tray.language'), 
        submenu: languageManager.getAvailableLanguages().map(lang => ({
            label: lang.name,
            type: 'radio',
            checked: languageManager.currentLanguage === lang.code,
            click: () => changeLanguage(lang.code)
        }))
    },
    { type: 'separator' },
    { label: languageManager.get('tray.exit'), click: () => shutdownAndExit(0) }
];

// ==================== ORİJİNAL FONKSİYONLAR ====================
function showTrayNotification(title, body) {
    if (tray) {
        try {
            tray.displayBalloon({
                title,
                content: body
            });
        } catch (e) {}

        try {
            new Notification({ title, body }).show();
        } catch (e) {}
    }
}

async function getActiveProfileId() {
    if (!page) return null;
    try {
        const index = await page.evaluate(() => {
            const val = getComputedStyle(document.documentElement)
                .getPropertyValue('--translateY')
                .replace('%', '')
                .trim();
            const num = Number(val);
            if (isNaN(num)) return null;
            return Math.round(num / 100);
        });
        const profileMap = ['ProfileDef', 'Profile1', 'Profile2', 'Profile3', 'Profile4'];
        return profileMap[index] || null;
    } catch {
        return null;
    }
}

function getChromiumPid() {
    try {
        const proc = browser?.process?.();
        return proc?.pid || null;
    } catch {
        return null;
    }
}

function hideChromiumWindow() {
    const pid = getChromiumPid();
    if (!pid) return;
    execFile(WINCTL_PATH, ['hide', String(pid)], { windowsHide: true }, () => {});
}

function showChromiumWindow() {
    const pid = getChromiumPid();
    if (!pid) return;
    execFile(WINCTL_PATH, ['show', String(pid)], { windowsHide: true }, () => {});
}

function toggleChromiumWindow() {
    if (isHidden) {
        showChromiumWindow();
        isHidden = false;
    } else {
        hideChromiumWindow();
        isHidden = true;
    }
}

async function shutdownAndExit(code = 0) {
    try {
        if (initialRefreshInterval) {
            clearInterval(initialRefreshInterval);
            initialRefreshInterval = null;
        }
        if (loginCheckInterval) {
            clearInterval(loginCheckInterval);
            loginCheckInterval = null;
        }
        if (profileCheckInterval) {
            clearInterval(profileCheckInterval);
            profileCheckInterval = null;
        }
        if (server) {
            try {
                server.close();
            } catch (e) {}
            server = null;
        }
        if (browser) {
            try {
                await browser.close();
            } catch (e) {}
            browser = null;
        }
    } catch (e) {}

    try {
        app.quit();
    } catch (e) {
        process.exit(code);
    }
}

async function startBrowser() {
    const userDataPath = path.join(__dirname, 'chromium-profile');
    const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--start-maximized',
        '--disable-infobars',
        '--disable-session-crashed-bubble',
        '--disable-features=TranslateUI',
        `--app=${START_URL}`
    ];

    if (forceKiosk) launchArgs.push('--kiosk');

    browser = await puppeteer.launch({
        headless: false,
        userDataDir: userDataPath,
        args: launchArgs,
        defaultViewport: null
    });

    const pages = await browser.pages();
    page = pages.length ? pages[0] : await browser.newPage();

    await page.goto(START_URL, { waitUntil: 'networkidle2' }).catch(() => {});
    await page.bringToFront().catch(() => {});

    setupCloseHandlers();

    // Giriş kontrolünü başlat
    startLoginMonitor();

    // HTTP sunucusunu başlat
    startHttpServer();
}

async function runClickById(id) {
    if (!page) {
        return false;
    }
    try {
        const res = await page.evaluate((el) => {
            const target = document.getElementById(el);
            if (!target) return { ok: false };
            target.click();
            return { ok: true };
        }, id);
        return !!(res && res.ok);
    } catch (err) {
        return false;
    }
}

function buildTray() {
    let iconPath = path.join(__dirname, 'tray-icon.png');
    let image = null;
    try {
        image = nativeImage.createFromPath(iconPath);
        if (image.isEmpty()) image = null;
    } catch (e) {
        image = null;
    }
    tray = new Tray(image || nativeImage.createEmpty());
    tray.setToolTip(languageManager.get('tray.tooltip'));
    updateTrayMenu();
    
    // Tıklama ile gizleme/gösterme
    tray.on('click', () => {
        toggleChromiumWindow();
    });
}

function updateTrayMenu() {
    const menu = Menu.buildFromTemplate(trayMenuTemplate.map(item => Object.assign({}, item)));
    tray.setContextMenu(menu);
}

async function refreshTrayNames() {
    if (!page) return null;
    try {
        const namesAndActive = await page.evaluate(() => {
            const map = {};
            let activeId = null;
            document.querySelectorAll('label.profileName').forEach(el => {
                const key = el.getAttribute('for');
                if (key) {
                    map[key] = el.textContent.trim();
                    if (el.classList.contains('active')) {
                        activeId = key;
                    }
                }
            });
            return { map, activeId };
        });

        const { map, activeId } = namesAndActive;
        trayMenuTemplate = trayMenuTemplate.map(item => {
            if (item.id && map[item.id]) {
                return Object.assign({}, item, {
                    label: map[item.id] || item.label
                });
            }
            return item;
        });
        updateTrayMenu();
        return activeId;
    } catch (e) {
        return null;
    }
}

async function clickAndUpdate(profileId) {
    try {
        // Giriş kontrolü
        const translateY = await page.evaluate(() => {
            return document.documentElement.style.getPropertyValue('--translateY');
        });
        
        if (translateY === '') {
            showTrayNotification(
                languageManager.get('notifications.loginRequired'),
                languageManager.get('messages.loginToChangeProfile')
            );
            return;
        }

        const ok = await runClickById(profileId);
        if (ok) {
            // ANINDA bildirim (gecikme YOK)
            // Profil isimlerini güncelle (siteden al)
            await refreshTrayNames();
            
            const activeProfile = trayMenuTemplate.find(item => item.id === profileId);
            const profileName = activeProfile ? activeProfile.label : profileId;
            
            showTrayNotification(
                languageManager.get('notifications.profileChanged'),
                languageManager.get('messages.activeProfile', { profileName })
            );
        }
    } catch (e) {}

    // Tray'i güncelle (arayüz için)
    await refreshTrayNames().catch(() => {});
}

function startHttpServer() {
    const appServer = express();
    appServer.use(express.json());
    appServer.post('/control', async (req, res) => {
        let p = req.body?.port;
    // p string veya number olabilir. string ise 's' ile bitip bitmediğine bakacağız.
        let silent = false;
        let portNum;

        if (typeof p === 'string') {
            if (p.endsWith('s')) {
                silent = true;
            // 's' harfini kaldır ve sayıya çevir
                portNum = parseInt(p.slice(0, -1), 10);
            } else {
                portNum = parseInt(p, 10);
            }
        } else if (typeof p === 'number') {
            portNum = p;
        } else {
            return res.status(400).json({ error: 'invalid port. use 1..5 or 1s..5s' });
        }

        const map = { 1: 'ProfileDef', 2: 'Profile1', 3: 'Profile2', 4: 'Profile3', 5: 'Profile4' };
        if (!map[portNum]) {
            return res.status(400).json({ error: 'invalid port. use 1..5 or 1s..5s' });
        }
        const profileId = map[portNum];
        const ok = await runClickById(profileId);
        await refreshTrayNames().catch(() => {});
        if (ok) {
        // Eğer silent mod değilse bildirim gönder
            if (!silent) {
                const profileName = trayMenuTemplate.find(item => item.id === profileId)?.label || profileId;
                showTrayNotification(
                    languageManager.get('notifications.profileChanged'),
                    languageManager.get('messages.activeProfile', { profileName })
                );
            }
            res.json({ status: 'ok' });
        } else {
            res.status(500).json({ status: 'error' });
        }
    });
    server = appServer.listen(HTTP_PORT);
}

function setupCloseHandlers() {
    if (!browser) return;

    try {
        browser.on('disconnected', () => {
            shutdownAndExit(0);
        });
    } catch (e) {}

    try {
        const proc = browser.process && browser.process();
        if (proc && proc.pid) {
            proc.on('exit', () => {
                shutdownAndExit(0);
            });
            proc.on('close', () => {
                shutdownAndExit(0);
            });
        }
    } catch (e) {}

    app.on('before-quit', async () => {
        if (browser) {
            try {
                await browser.close();
            } catch (e) {}
            browser = null;
        }
    });

    app.on('window-all-closed', () => {
        shutdownAndExit(0);
    });

    process.on('SIGINT', () => shutdownAndExit(0));
    process.on('SIGTERM', () => shutdownAndExit(0));
}

// ==================== YENİ GİRİŞ KONTROL SİSTEMİ ====================
async function quickTranslateYCheck() {
    if (!page) return null;
    try {
        const translateY = await page.evaluate(() => {
            return document.documentElement.style.getPropertyValue('--translateY');
        });
        return {
            translateY: translateY,
            isLoggedIn: translateY !== '',
            profileIndex: translateY ? Math.round(parseFloat(translateY) / 100) || 0 : null
        };
    } catch (error) {
        return null;
    }
}

async function startLoginMonitor() {
    if (loginCheckInterval) {
        clearInterval(loginCheckInterval);
    }
    
    loginNotificationSent = false;
    
    // İlk kontrol hemen yapılsın
    setTimeout(async () => {
        const result = await quickTranslateYCheck();
        if (result && result.isLoggedIn) {
            handleLoggedIn(result);
        }
    }, 1000);
    
    // 1 saniyede bir kontrol
    loginCheckInterval = setInterval(async () => {
        const result = await quickTranslateYCheck();
        
        if (!result) return;
        
        if (result.isLoggedIn) {
            clearInterval(loginCheckInterval);
            loginCheckInterval = null;
            
            if (!loginNotificationSent) {
                handleLoggedIn(result);
            }
        }
    }, 1000);
}

async function handleLoggedIn(loginInfo) {
    loginNotificationSent = true;
    
    const profileMap = ['ProfileDef', 'Profile1', 'Profile2', 'Profile3', 'Profile4'];
    const profileId = profileMap[loginInfo.profileIndex] || 'Profile1';
    
    // SADECE İLK GİRİŞTE 1 SANİYE GECİKME
    setTimeout(async () => {
        // Profil isimlerini güncelle (siteden al)
        await refreshTrayNames();
        
        const activeProfile = trayMenuTemplate.find(item => item.id === profileId);
        const profileName = activeProfile ? activeProfile.label : 'Profile 1';
        
        // Bildirimi gönder
        showTrayNotification(
            languageManager.get('notifications.loginSuccessful'),
            languageManager.get('messages.activeProfile', { profileName })
        );
    }, 1000); // SADECE BURADA 1 SANİYE GECİKME
    
    // Profil isim kontrolünü başlat
    startProfileCheck();
}

function startProfileCheck() {
    if (profileCheckInterval) {
        clearInterval(profileCheckInterval);
    }
    
    // Profil isimlerini kontrol et (5 saniyede bir)
    profileCheckInterval = setInterval(async () => {
        if (!page) return;
        
        // Giriş durumunu kontrol et
        const result = await quickTranslateYCheck();
        if (!result || !result.isLoggedIn) {
            // Çıkış yapılmış, tekrar login kontrolüne dön
            clearInterval(profileCheckInterval);
            profileCheckInterval = null;
            loginNotificationSent = false;
            startLoginMonitor();
            return;
        }
        
        // Profil isimlerini güncelle
        await refreshTrayNames().catch(() => {});
    }, 5000);
}

// ==================== DİL DEĞİŞTİRME VE TRAY YENİLEME ====================
function changeLanguage(langCode) {
    if (languageManager.setLanguage(langCode)) {
        // Tüm tray menüyü yeniden oluştur
        trayMenuTemplate = [
            { id: 'ProfileDef', label: 'Default', click: () => clickAndUpdate('ProfileDef') },
            { id: 'Profile1', label: 'Profile 1', click: () => clickAndUpdate('Profile1') },
            { id: 'Profile2', label: 'Profile 2', click: () => clickAndUpdate('Profile2') },
            { id: 'Profile3', label: 'Profile 3', click: () => clickAndUpdate('Profile3') },
            { id: 'Profile4', label: 'Profile 4', click: () => clickAndUpdate('Profile4') },
            { type: 'separator' },
            { label: languageManager.get('tray.refresh'), click: () => refreshTrayNames() },
            { label: languageManager.get('tray.hideShow'), click: () => toggleChromiumWindow() },
            { type: 'separator' },
            { 
                label: languageManager.get('tray.language'), 
                submenu: languageManager.getAvailableLanguages().map(lang => ({
                    label: lang.name,
                    type: 'radio',
                    checked: languageManager.currentLanguage === lang.code,
                    click: () => changeLanguage(lang.code)
                }))
            },
            { type: 'separator' },
            { label: languageManager.get('tray.exit'), click: () => shutdownAndExit(0) }
        ];
        
        // Tray menüyü güncelle
        updateTrayMenu();
        tray.setToolTip(languageManager.get('tray.tooltip'));
        return true;
    }
    return false;
}
// ==================== UYGULAMA BAŞLATMA ====================
app.on('ready', async () => {
    try {
        buildTray();
        await startBrowser();
    } catch (err) {
        shutdownAndExit(1);
    }
});

app.on('window-all-closed', () => {});