/**
 * Datalitics Integration Script v3
 *
 * Enhanced version with Elementor support, debouncing, and smart monitoring.
 * This script handles embedding Datalitics forms, modifying links with tracking parameters,
 * and creating WhatsApp buttons with optimized performance for dynamic content.
 *
 * External Variables (should be defined before this script):
 * - codeWpLink (optional): WhatsApp button link code
 * - codeWpRedirectLink (optional): WhatsApp redirect link code
 *
 * Debug Functions (available globally):
 * - window.dataliticsDebug(true/false) - Enable/disable debug mode
 * - window.dataliticsReprocess() - Force reprocessing of all elements
 * - window.dataliticsStatus() - Get current status information
 * - window.dataliticsCleanup() - Clean up all timers and event handlers
 */

let endpointFormDatalitics = "https://form.datalitics.com.br";
let endpointFormDatalitics2 = "https://forms.faleconosco.chat";
let endpointWpDatalitics = "https://whatsapp.datalitics.com.br";
let endpointWpDatalitics2 = "https://wp.faleconosco.chat";
let endpointChatDatalitics = "https://chat.datalitics.com.br";

// Store parameters globally to reuse in observers
let globalParametrosString = "";
let processedLinks = new Set(); // Track processed links by href
let debugMode = false; // Set to true for debugging
const messageHandlers = new Map(); // Store message handlers to avoid duplicates

// Elementor-specific variables
let elementorLoadAttempts = 0;
let maxElementorAttempts = 50; // Máximo de tentativas
let elementorCheckInterval = 500; // Intervalo entre verificações (ms)
let lastElementCount = 0;
let stableElementCount = 0;
let isElementorDetected = false;

// Debouncing timeout management
let debounceTimeoutId = null;

// Função para normalizar parâmetros e evitar "undefined"
function normalizeParams(params) {
    if (!params || params === 'undefined' || params === undefined || params === null) {
        return "";
    }
    return params;
}

// Helper function to merge query parameters and avoid duplicates
function mergeQueryParams(targetUrl, paramsToMerge) {
    if (!paramsToMerge) return targetUrl;

    try {
        const urlObj = new URL(targetUrl, window.location.origin);
        const searchParams = new URLSearchParams(urlObj.search);

        // Clean paramsToMerge (remove leading ?)
        const cleanParams = paramsToMerge.startsWith('?') ? paramsToMerge.substring(1) : paramsToMerge;
        const mergeParams = new URLSearchParams(cleanParams);

        // Merge parameters, giving priority to those in paramsToMerge (or vice-versa, but usually we want to preserve/overwrite)
        // Datalitics requirement is usually to append what we captured from the landing page.
        mergeParams.forEach((value, key) => {
            searchParams.set(key, value);
        });

        urlObj.search = searchParams.toString();
        return urlObj.toString();
    } catch (e) {
        log('Error merging query params:', e);
        // Fallback for non-URL formats (like just paths)
        const connector = targetUrl.includes('?') ? '&' : '?';
        const cleanParams = paramsToMerge.startsWith('?') ? paramsToMerge.substring(1) : paramsToMerge;
        return `${targetUrl}${connector}${cleanParams}`;
    }
}

// Debug function
function log(message, data = null) {
    if (debugMode) {
        console.log(`[Datalitics] ${message}`, data || "");
    }
}

// Security: Validate URLs to prevent open redirect vulnerabilities
function isValidDataliticsUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }

    try {
        const urlObj = new URL(url);
        const allowedDomains = [
            'datalitics.com.br',
            'faleconosco.chat'
        ];

        return allowedDomains.some(domain =>
            urlObj.hostname.endsWith(domain) || urlObj.hostname === domain
        );
    } catch (e) {
        log('Invalid URL detected:', url);
        return false;
    }
}

/**
 * Robust navigation helper for restricted browsers (Instagram IAB, etc.)
 * Uses multiple methods to ensure redirection occurs.
 */
function dataliticsNavigate(url) {
    if (!url) return;

    log("Navigating to:", url);

    // Method 1: standard href assignment
    try {
        window.location.href = url;
    } catch (e) {
        log("Method 1 (href) failed:", e);
    }

    // Method 2: Hidden anchor click (often bypasses IAB blocks for automatic redirects)
    try {
        const a = document.createElement("a");
        a.href = url;
        a.style.display = "none";
        // In some browsers, the element must be in the DOM to trigger a click
        document.body.appendChild(a);
        a.click();

        // Cleanup
        setTimeout(() => {
            if (a.parentNode) {
                document.body.removeChild(a);
            }
        }, 100);
    } catch (e) {
        log("Method 2 (anchor) failed:", e);
    }

    // Method 3: window.location.replace as final fallback
    setTimeout(() => {
        try {
            window.location.replace(url);
        } catch (e) {
            log("Method 3 (replace) failed:", e);
        }
    }, 500);
}

// Detecta se estamos em um site Elementor
function detectElementor() {
    const indicators = [
        () => document.querySelector(".elementor"),
        () => document.querySelector("[data-elementor-type]"),
        () => document.querySelector(".elementor-element"),
        () => window.elementorFrontend,
        () => window.ElementorProFrontend,
        () => document.body.classList.contains("elementor-page"),
        () => document.querySelector('link[href*="elementor"]'),
        () => document.querySelector('script[src*="elementor"]'),
    ];

    const detected = indicators.some((check) => {
        try {
            return check();
        } catch {
            return false;
        }
    });

    if (detected && !isElementorDetected) {
        isElementorDetected = true;
        log("Elementor detected! Activating enhanced monitoring.");
    }

    return detected;
}

// Verifica se o Elementor terminou de carregar
function isElementorLoaded() {
    // Múltiplas verificações para determinar se o Elementor carregou
    const checks = [
        // Verifica se o frontend do Elementor está pronto
        () =>
            window.elementorFrontend &&
            window.elementorFrontend.isEditMode !== undefined,
        // Verifica se não há mais elementos sendo carregados
        () => !document.querySelector(".elementor-loading"),
        // Verifica se não há spinners ou loaders
        () => !document.querySelector(".elementor-loader, .eicon-loading"),
        // Verifica se os elementos têm conteúdo renderizado
        () => {
            const elements = document.querySelectorAll(".elementor-element");
            return (
                elements.length > 0 &&
                Array.from(elements).some((el) => el.offsetHeight > 0)
            );
        },
    ];

    const passedChecks = checks.filter((check) => {
        try {
            return check();
        } catch {
            return false;
        }
    }).length;

    log(`Elementor load checks: ${passedChecks}/${checks.length} passed`);
    return passedChecks >= checks.length - 1; // Permite falhar em 1 check
}

// Conta elementos na página para detectar mudanças
function countPageElements() {
    const selectors = [
        "a[href]",
        'div[id^="datalitics-form-"]',
        ".elementor-element",
        ".elementor-widget",
    ];

    return selectors.reduce((total, selector) => {
        return total + document.querySelectorAll(selector).length;
    }, 0);
}

// Get all target endpoints for easier management
function getTargetEndpoints() {
    return [
        endpointWpDatalitics,
        endpointFormDatalitics,
        endpointWpDatalitics2,
        endpointFormDatalitics2,
        endpointChatDatalitics,
    ].map((endpoint) => endpoint.replace(/^https?:\/\//, "")); // Remove protocol for flexible matching
}

async function createForms(params) {
    // Normaliza params para evitar undefined nas URLs
    const normalizedParams = normalizeParams(params);

    const divs = document.querySelectorAll('div[id^="datalitics-form-"]');
    log(`Found ${divs.length} form divs to process`);

    if (divs.length > 0) {
        for (const div of divs) {
            if (extractHexadecimalForm(div.id)) {
                const code = extractHexadecimalForm(div.id);
                const URL = mergeQueryParams(`${endpointFormDatalitics2}/embed/${code}`, normalizedParams);

                // Check if iframe already exists
                if (document.getElementById(code)) {
                    log(`Form iframe ${code} already exists, skipping`);
                    continue;
                }

                const iframeElement = document.createElement("iframe");
                iframeElement.setAttribute("src", URL);
                iframeElement.setAttribute("class", "datalitics-form");
                iframeElement.setAttribute("id", code);

                // Only add message handler if not already registered for this code
                if (!messageHandlers.has(code)) {
                    const handler = function (event) {
                        if (
                            event.data &&
                            event.data.key === code &&
                            typeof event.data.value === "number"
                        ) {
                            const iframe = document.getElementById(code);
                            if (iframe) {
                                iframe.style.height = event.data.value + "px";
                            }
                        }
                    };

                    messageHandlers.set(code, handler);
                    window.addEventListener("message", handler, false);
                }

                const dataliticsForm = div;

                if (dataliticsForm) {
                    dataliticsForm.parentNode.replaceChild(iframeElement, dataliticsForm);
                    log(`Created form iframe for code: ${code}`);
                }

                // Usa normalizedParams em vez de params direto
                replaceURLs(
                    `${endpointFormDatalitics}/${extractHexadecimalForm(div.id)}`,
                    mergeQueryParams(`${endpointFormDatalitics}/${extractHexadecimalForm(div.id)}`, normalizedParams)
                );
                replaceURLs(
                    `${endpointFormDatalitics2}/${extractHexadecimalForm(div.id)}`,
                    mergeQueryParams(`${endpointFormDatalitics2}/${extractHexadecimalForm(div.id)}`, normalizedParams)
                );
            }
        }
    }
}

function extractHexadecimalForm(id) {
    // Verifica se o id começa com "datalitics-form-"
    if (id && id.startsWith("datalitics-form-")) {
        // Extrai o valor hexadecimal do id removendo "datalitics-form-"
        return id.replace("datalitics-form-", "");
    } else {
        // Retorna null se o id não começar com "datalitics-form-"
        return null;
    }
}

function getCookie(e) {
    let t = document.cookie.split(";");
    for (let l of t) {
        let [o, n] = l.split("=");
        if (o.trim() === e) return decodeURIComponent(n);
    }
    return null;
}

function setCookie(e, t, l) {
    if (getCookie(e)) {
        // Se existir, define um novo cookie com o mesmo nome, valor vazio e data de expiração no passado
        document.cookie = `${e}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    }

    let o = new Date();
    o.setDate(o.getDate() + l);
    let n = encodeURIComponent(t) + (l ? `; expires=${o.toUTCString()}` : "");
    document.cookie = `${e}=${n}; path=/`;
}

function replaceURLs(e, t) {
    let l = document.getElementsByTagName("a");
    for (let o = 0; o < l.length; o++) {
        let n = l[o],
            i = n.href;
        if (i && i.includes(e)) {
            n.href = i.replace(e, t);
            log(`Replaced URL: ${e} -> ${t}`);
        }
    }
}

// Enhanced function to check if a URL matches target endpoints
function isTargetLink(href) {
    if (!href) return false;

    const targetEndpoints = getTargetEndpoints();

    // Clean href for comparison
    const cleanHref = href.replace(/^https?:\/\//, "").toLowerCase();

    return targetEndpoints.some((endpoint) => {
        const cleanEndpoint = endpoint.toLowerCase();
        return cleanHref.includes(cleanEndpoint);
    });
}

// Enhanced function to get unique identifier for a link
function getLinkIdentifier(link) {
    // Use href + position in DOM as unique identifier
    const rect = link.getBoundingClientRect();
    return `${link.href}_${Math.round(rect.top)}_${Math.round(rect.left)}_${link.textContent?.slice(0, 50) || ""
        }`;
}

// Improved link modification function
function modifyLinks(parametrosString) {
    // Normaliza parametrosString para evitar undefined
    const normalizedParams = normalizeParams(parametrosString);

    if (!normalizedParams || normalizedParams.length === 0) {
        log("No parameters to add to links");
        return;
    }

    const links = document.querySelectorAll("a[href]");
    let modifiedCount = 0;
    let skippedCount = 0;

    log(`Processing ${links.length} links with params: ${normalizedParams}`);

    for (const link of links) {
        let href = link.getAttribute("href");

        // Verifica se o href existe
        if (!href) {
            skippedCount++;
            continue;
        }

        // Normaliza domínio antigo de WhatsApp para o novo
        if (href.includes("whatsapp.faleconosco.chat")) {
            href = href.replace(/whatsapp\.faleconosco\.chat/g, "wp.faleconosco.chat");
            link.href = href;
            log(`Normalized WhatsApp domain: ${href}`);
        }

        const linkId = getLinkIdentifier(link);

        // Skip if already processed
        if (processedLinks.has(linkId)) {
            skippedCount++;
            continue;
        }

        // Check if it's a target link
        if (isTargetLink(href)) {
            try {
                // Construct new URL using helper to avoid duplicates
                const newHref = mergeQueryParams(href, normalizedParams);

                // Apply the change
                link.href = newHref;
                link.setAttribute("data-datalitics-processed", "true");

                // Mark as processed
                processedLinks.add(linkId);
                modifiedCount++;

                log(`Modified link: ${href} -> ${newHref}`);
            } catch (error) {
                log(`Error processing link ${href}:`, error);
            }
        } else {
            // Mark non-target links as processed too to avoid re-checking
            processedLinks.add(linkId);
            skippedCount++;
        }
    }

    log(
        `Link processing complete. Modified: ${modifiedCount}, Skipped: ${skippedCount}`
    );
}

function createWPDatalitics() {
    if (
        typeof codeWpLink !== "undefined" &&
        codeWpLink &&
        (endpointWpDatalitics || endpointWpDatalitics2)
    ) {
        // Check if element already exists
        if (!document.querySelector(".wp-datalitics")) {
            const wpButton = document.createElement("div");
            wpButton.className = "wp-datalitics";
            wpButton.onclick = function () {
                const params = getCookie("params");
                const baseUrl = `${endpointWpDatalitics2}/${codeWpLink}`;
                const urlWithParams = mergeQueryParams(baseUrl, params);
                const finalUrl = mergeQueryParams(urlWithParams, "?isWpButtom=true");

                if (isValidDataliticsUrl(finalUrl)) {
                    dataliticsNavigate(finalUrl);
                } else {
                    log('Invalid URL blocked in WP button:', finalUrl);
                }
            };
            document.body.appendChild(wpButton);

            log("Created WP Datalitics button");
        }
    }
}

function createWPRedirectDatalitics() {
    if (
        typeof codeWpRedirectLink !== "undefined" &&
        codeWpRedirectLink &&
        (endpointWpDatalitics || endpointWpDatalitics2)
    ) {
        // Check if element already exists
        if (!document.querySelector(".wp-redirect-datalitics")) {
            // Different class to avoid conflicts
            const wpButton = document.createElement("div");
            wpButton.className = "wp-redirect-datalitics"; // Different class name
            wpButton.onclick = function () {
                const params = getCookie("params");
                const baseUrl = `${endpointWpDatalitics2}/redirect/${codeWpRedirectLink}`;
                const urlWithParams = mergeQueryParams(baseUrl, params);
                const finalUrl = mergeQueryParams(urlWithParams, "?isWpButtom=true");

                if (isValidDataliticsUrl(finalUrl)) {
                    window.open(finalUrl, "_blank");
                } else {
                    log('Invalid URL blocked in WP redirect button:', finalUrl);
                }
            };
            document.body.appendChild(wpButton);

            log("Created WP Redirect Datalitics button");
        }
    }
}

function receiveMessage(event) {
    if (
        !event.origin.includes(endpointFormDatalitics) &&
        !event.origin.includes(endpointFormDatalitics2)
    )
        return;

    if (event.data?.redirectUrl) {
        // Security: Validate redirect URL before using it
        if (isValidDataliticsUrl(event.data.redirectUrl)) {
            dataliticsNavigate(event.data.redirectUrl);
        } else {
            log('Invalid redirect URL blocked:', event.data.redirectUrl);
            console.warn('Invalid redirect URL blocked:', event.data.redirectUrl);
        }
    }
}

// Função principal de processamento
function processElements() {
    log("Processing elements...");
    const normalizedGlobalParams = normalizeParams(globalParametrosString);

    createForms(normalizedGlobalParams);
    modifyLinks(normalizedGlobalParams);
    createWPDatalitics();
    createWPRedirectDatalitics();
}

// Sistema de monitoramento específico para Elementor
function setupElementorMonitoring() {
    if (!detectElementor()) {
        log("Elementor not detected, using standard monitoring");
        return false;
    }

    let consecutiveStableChecks = 0;
    const requiredStableChecks = 3; // Número de verificações consecutivas estáveis necessárias

    function checkElementorProgress() {
        elementorLoadAttempts++;

        const currentElementCount = countPageElements();
        log(
            `Elementor check #${elementorLoadAttempts}: ${currentElementCount} elements found`
        );

        // Verifica se o número de elementos está estável
        if (currentElementCount === lastElementCount) {
            consecutiveStableChecks++;
            stableElementCount++;
        } else {
            consecutiveStableChecks = 0;
            stableElementCount = 0;
            lastElementCount = currentElementCount;
        }

        // Processa elementos a cada mudança significativa ou a cada 3 tentativas
        if (elementorLoadAttempts % 3 === 0 || consecutiveStableChecks === 1) {
            processElements();
        }

        // Condições para parar o monitoramento
        const shouldStop =
            elementorLoadAttempts >= maxElementorAttempts || // Máximo de tentativas atingido
            (consecutiveStableChecks >= requiredStableChecks &&
                isElementorLoaded()) || // Carregamento detectado como completo
            (stableElementCount >= 10 && currentElementCount > 10); // Muitos elementos estáveis

        if (shouldStop) {
            log(
                `Elementor monitoring stopped. Reason: ${elementorLoadAttempts >= maxElementorAttempts
                    ? "Max attempts reached"
                    : consecutiveStableChecks >= requiredStableChecks
                        ? "Stable and loaded"
                        : "Stable element count"
                }`
            );

            // Execução final
            processElements();

            // Configura monitoramento de backup reduzido
            setupReducedBackupMonitoring();
            return;
        }

        // Agenda próxima verificação
        setTimeout(checkElementorProgress, elementorCheckInterval);
    }

    // Hook para eventos específicos do Elementor
    if (window.elementorFrontend) {
        window.elementorFrontend.hooks.addAction(
            "frontend/element_ready/global",
            function () {
                log("Elementor element ready detected");
                processElements();
            }
        );
    }

    // Inicia o monitoramento
    setTimeout(checkElementorProgress, 100);

    return true;
}

// Monitoramento de backup reduzido (após Elementor carregar)
function setupReducedBackupMonitoring() {
    let backupAttempts = 0;
    const maxBackupAttempts = 20;

    function backupCheck() {
        backupAttempts++;

        if (backupAttempts > maxBackupAttempts) {
            log("Backup monitoring completed");
            return;
        }

        const unprocessedForms = document.querySelectorAll(
            'div[id^="datalitics-form-"]:not([data-processed="true"])'
        );
        const unprocessedLinks = document.querySelectorAll(
            'a[href]:not([data-datalitics-processed="true"])'
        ).length;

        if (unprocessedForms.length > 0 || unprocessedLinks > 0) {
            log(
                `Backup processing: ${unprocessedForms.length} forms, ~${unprocessedLinks} links`
            );
            processElements();
        }

        // Intervalo crescente: 3s, 5s, 8s, 10s, depois 15s
        const interval =
            backupAttempts <= 5
                ? 3000
                : backupAttempts <= 10
                    ? 5000
                    : backupAttempts <= 15
                        ? 8000
                        : 15000;

        setTimeout(backupCheck, interval);
    }

    setTimeout(backupCheck, 3000);
}

// Enhanced mutation observer com detecção específica de Elementor
function setupMutationObserver() {
    function debouncedUpdate() {
        // Clear previous timeout if exists
        if (debounceTimeoutId) {
            clearTimeout(debounceTimeoutId);
        }

        // Set new timeout
        debounceTimeoutId = setTimeout(
            () => {
                log("Processing DOM changes...");
                processElements();
                debounceTimeoutId = null; // Clear after execution
            },
            isElementorDetected ? 200 : 100
        ); // Delay maior para Elementor
    }

    const observer = new MutationObserver((mutations) => {
        let hasRelevantChanges = false;

        mutations.forEach((mutation) => {
            // Check for added nodes
            if (mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        // Element node
                        // Elementor-specific checks
                        if (
                            node.classList?.contains("elementor-element") ||
                            node.classList?.contains("elementor-widget") ||
                            node.querySelector?.(".elementor-element, .elementor-widget")
                        ) {
                            hasRelevantChanges = true;
                            log("Elementor element change detected");
                        }

                        // Standard checks
                        if (
                            node.nodeName === "A" ||
                            (node.querySelector && node.querySelector("a[href]"))
                        ) {
                            hasRelevantChanges = true;
                        }

                        if (
                            node.id?.startsWith("datalitics-form-") ||
                            (node.querySelector &&
                                node.querySelector('div[id^="datalitics-form-"]'))
                        ) {
                            hasRelevantChanges = true;
                        }
                    }
                });
            }

            // Check for attribute changes
            if (
                mutation.type === "attributes" &&
                (mutation.attributeName === "href" ||
                    mutation.attributeName === "class") &&
                mutation.target.nodeName === "A"
            ) {
                hasRelevantChanges = true;
            }
        });

        if (hasRelevantChanges) {
            log("Relevant DOM changes detected, scheduling update");
            debouncedUpdate();
        }
    });

    const config = {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["href", "id", "class", "data-elementor-type"],
    };

    observer.observe(document.body, config);
    log("Enhanced mutation observer initialized");
}

// Enhanced initialization
function initialize() {
    const url = window.location.href;
    const parametrosIndex = url.indexOf("?");
    let parametrosString = "";

    if (parametrosIndex !== -1) {
        parametrosString = url.substring(parametrosIndex);
    }

    // Store params globally for use by the observer - normaliza antes de armazenar
    globalParametrosString = normalizeParams(
        parametrosString.length > 0 ? parametrosString : getCookie("params") || ""
    );

    log("Initializing Datalitics script", {
        url: url,
        parametrosString: parametrosString,
        globalParametrosString: globalParametrosString,
        isElementor: detectElementor(),
    });

    if (parametrosString.length > 0) {
        setCookie("params", parametrosString, 1);
    }

    // Execução inicial
    processElements();

    // Setup monitoring based on Elementor detection
    const elementorMonitoringActive = setupElementorMonitoring();

    if (!elementorMonitoringActive) {
        // Fallback para sites não-Elementor
        setupReducedBackupMonitoring();
    }

    // Setup mutation observer
    setupMutationObserver();

    log("Datalitics script initialization complete");
}

// Handle different loading states with multiple hooks
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
} else {
    // DOM is already loaded
    setTimeout(initialize, 100);
}

// Additional hooks for different scenarios
window.addEventListener("load", () => {
    setTimeout(() => {
        log("Window load event - processing elements");
        processElements();
    }, 500);
});

// jQuery ready hook (if jQuery is present)
if (window.jQuery) {
    window.jQuery(document).ready(() => {
        setTimeout(() => {
            log("jQuery ready - processing elements");
            processElements();
        }, 300);
    });
}

// Continue listening for postMessage events
window.addEventListener("message", receiveMessage, false);

// Cleanup function to clear all timers and handlers
window.dataliticsCleanup = function () {
    log("Cleanup triggered");

    // Clear debounce timeout
    if (debounceTimeoutId) {
        clearTimeout(debounceTimeoutId);
        debounceTimeoutId = null;
    }

    // Clear message handlers
    messageHandlers.forEach((handler) => {
        window.removeEventListener("message", handler, false);
    });
    messageHandlers.clear();

    log("Cleanup completed");
};

// Expose debug and control functions
window.dataliticsDebug = function (enable = true) {
    debugMode = enable;
    log(`Debug mode ${enable ? "enabled" : "disabled"}`);
};

window.dataliticsReprocess = function () {
    log("Manual reprocessing triggered");
    processedLinks.clear(); // Reset processed links
    processElements();
};

window.dataliticsStatus = function () {
    return {
        elementorDetected: isElementorDetected,
        attempts: elementorLoadAttempts,
        processedLinks: processedLinks.size,
        globalParams: globalParametrosString,
        elementCount: countPageElements(),
        messageHandlers: messageHandlers.size,
    };
};