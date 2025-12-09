(function() { // Umschließt das gesamte Skript in eine Funktion (IIFE)
/**
 * Content Script für die LinkedIn Mini Sudoku-Seite.
 * Verantwortlich für DOM-Parsing, Lösungsberechnung und Anzeige des Overlays.
 *
 * AKTUELLE LOGIK: Die Sichtbarkeit der UI wird durch einen MutationObserver
 * gesteuert, der auf die Präsenz des Gitter-Selektors (.sudoku-cell-content) reagiert.
 */

// --- KONSTANTEN UND GLOBALE ZUSTÄNDE ---

// Selektor für die Sudoku-Zellen
const CELL_SELECTOR = '.sudoku-cell-content';

// Selektoren für die Ziffern-Buttons im Spiel-UI 
const NUMBER_BUTTON_SELECTOR = '.sudoku-input-button, span[class*="sudoku-input"]';

const SOLVER_UI_CLASS = 'linkedin-sudoku-solver-ui'; 
const SOLVE_BUTTON_ID = 'solve-sudoku-btn';
const SOLUTION_OVERLAY_ID = 'solver-solution-overlay'; 
const MESSAGE_ID = 'solver-message';
const INITIAL_WAIT_MS = 2000;
const MAX_RETRIES = 50; 

// Polling-Konstanten für stabile Eingabe (werden nur noch für enterSingleValue verwendet)
const INPUT_POLL_INTERVAL_MS = 50; 
const MAX_POLL_COUNT = 10;         

let retryCount = 0;
let CURRENT_CELL_SELECTOR = ''; 

// Zustand zur Speicherung der Gitterdaten
const appState = {
    initialGrid: null, // Das Gitter beim Start (Vorgaben)
    solvedGrid: null,  // Das vollständig gelöste Gitter
    containers: null,  // Die 36 DOM-Elemente
    isInitialized: false // Verfolgt, ob das UI bereits erstellt wurde
};


/**
 * Sucht die 36 Zellen-Container ausschließlich mit dem stabilen Selektor.
 *
 * @returns {NodeListOf<Element> | null} Die Liste der 36 Container-Elemente.
 */
function getGridContainers() {
    const containers = document.querySelectorAll(CELL_SELECTOR);
    
    if (containers.length === 36) {
        CURRENT_CELL_SELECTOR = CELL_SELECTOR;
        return containers;
    }
    return null;
}

/**
 * Liest den aktuellen Zustand des 6x6 Mini-Sudoku-Gitters aus dem DOM.
 */
function getGridFromDOM() {
    const containers = getGridContainers();
    
    if (!containers || containers.length !== 36) {
        return null;
    }

    const grid = [];
    for (let i = 0; i < 6; i++) {
        grid[i] = [];
        for (let j = 0; j < 6; j++) {
            const index = i * 6 + j;
            const container = containers[index];
            
            let value = 0;

            // 1. Suche nach Input-Feld (für bereits manuell gefüllte Zellen)
            const input = container.querySelector('input');
            if (input && input.value && !isNaN(parseInt(input.value))) {
                value = parseInt(input.value);
            } else {
                // 2. Suche nach dem inneren Element, das die Startziffer hält
                const permanentElement = container.querySelector('span') || container.querySelector('div:not(:has(input))');
                const textValue = permanentElement ? permanentElement.textContent.trim() : container.textContent.trim();
                value = parseInt(textValue) || 0;
            }

            grid[i][j] = value;
        }
    }
    return { grid, cells: containers };
}

// --- INTERAKTIVE LOGIK ---

/**
 * Trägt einen einzelnen Wert in das LinkedIn-Sudoku-Grid ein, indem es den Ziffern-Button klickt.
 * @param {number} r - Zeile (0-5)
 * @param {number} c - Spalte (0-5)
 * @param {number} value - Der einzutragende Wert
 * @returns {Promise<boolean>} True bei Erfolg.
 */
async function enterSingleValue(r, c, value) {
    const index = r * 6 + c;
    const container = appState.containers[index];
    
    try {
        // 1. Klicke auf den Container, um das Eingabefeld zu aktivieren und die Buttons anzuzeigen
        const mouseProps = { bubbles: true, cancelable: true, buttons: 1 };
        container.dispatchEvent(new MouseEvent('mousedown', mouseProps));
        container.dispatchEvent(new MouseEvent('mouseup', mouseProps));
        container.dispatchEvent(new MouseEvent('click', mouseProps)); 
        
        let numberButton = null;
        let pollCount = 0;

        // 2. Robustes Polling: Warte, bis der Ziffern-Button im DOM erscheint
        while (!numberButton && pollCount < MAX_POLL_COUNT) {
            await new Promise(resolve => setTimeout(resolve, INPUT_POLL_INTERVAL_MS)); 
            
            // Suche alle möglichen Ziffern-Buttons
            const buttons = document.querySelectorAll(NUMBER_BUTTON_SELECTOR);

            for (const btn of buttons) {
                // Prüft den Textinhalt des Buttons, um den richtigen Wert zu finden
                if (btn.textContent.trim() === value.toString()) {
                    numberButton = btn;
                    break;
                }
            }
            pollCount++;
        }

        if (numberButton) {
            // 3. Simuliere den Klick auf den Ziffern-Button (übernimmt das Eintragen)
            numberButton.dispatchEvent(new MouseEvent('mousedown', mouseProps));
            numberButton.dispatchEvent(new MouseEvent('mouseup', mouseProps));
            numberButton.dispatchEvent(new MouseEvent('click', mouseProps));
            
            return true;
        } else {
            return false;
        }
    } catch (e) {
        // console.error("Unerwarteter Fehler beim Eintragen des Wertes:", e); 
        return false;
    }
}

/**
 * Behandelt den Klick auf eine Zelle im Lösungs-Overlay.
 */
async function handleSolutionCellClick(event) {
    const targetCell = event.currentTarget;
    const messageElement = document.getElementById(MESSAGE_ID);

    if (targetCell.dataset.status === 'entered' || targetCell.dataset.status === 'given') {
        messageElement.textContent = 'Dieser Wert ist bereits gesetzt.';
        return;
    }
    
    const r = parseInt(targetCell.dataset.row);
    const c = parseInt(targetCell.dataset.col);
    const value = appState.solvedGrid[r][c];
    
    messageElement.textContent = `Trage Wert ${value} in Zelle (${r+1}, ${c+1}) ein...`;

    const success = await enterSingleValue(r, c, value);
    
    if (success) {
        targetCell.dataset.status = 'entered';
        targetCell.style.fontWeight = 'normal';
        targetCell.style.color = '#555555';
        targetCell.style.backgroundColor = '#f0f8ff'; 
        targetCell.removeEventListener('click', handleSolutionCellClick);
        
        messageElement.textContent = `Zelle (${r+1}, ${c+1}) erfolgreich eingetragen.`;

    } else {
        messageElement.textContent = `FEHLER beim Eintragen von ${value} in (${r+1}, ${c+1}). Bitte Konsole prüfen.`;
    }
}

/**
 * Zeigt die gelöste Gitterstruktur in einem überlagerten Grid an, ohne die Spielfelder zu manipulieren.
 */
function displaySolutionOverlay(initialGrid, solvedGrid) {
    const overlay = document.getElementById(SOLUTION_OVERLAY_ID);
    
    if (!overlay) {
        return;
    }

    const gridContainer = overlay.querySelector('.solver-solution-grid');
    
    if (!gridContainer) {
        return;
    }
    
    gridContainer.innerHTML = ''; 
    overlay.style.display = 'block';
    
    for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
            const cell = document.createElement('div');
            const isGiven = initialGrid[r][c] !== 0; 
            
            cell.textContent = solvedGrid[r][c];
            cell.dataset.row = r;
            cell.dataset.col = c;
            
            cell.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                width: 30px;
                height: 30px;
                border: 1px solid #ccc;
                font-size: 16px;
                cursor: ${isGiven ? 'default' : 'pointer'};
                
                /* VISUELLE UNTERSCHEIDUNG */
                font-weight: ${isGiven ? 'normal' : 'bold'};
                color: ${isGiven ? '#555555' : '#000000'}; 
                background-color: ${isGiven ? '#f7f7f7' : 'white'};
                
                /* Hinzufügen der dicken Linien für die 2x3 Blöcke */
                border-top-width: ${r % 2 === 0 ? '2px' : '1px'};
                border-left-width: ${c % 3 === 0 ? '2px' : '1px'};
                border-right-width: ${c === 5 ? '2px' : '1px'};
                border-bottom-width: ${r === 5 ? '2px' : '1px'};
                border-color: #555;
            `;
            
            if (!isGiven) {
                // Fügt den Click-Handler hinzu
                cell.addEventListener('click', handleSolutionCellClick);
                cell.dataset.status = 'to_enter';
            } else {
                cell.dataset.status = 'given';
            }
            
            gridContainer.appendChild(cell);
        }
    }
}


/**
 * Startet den Lösungsablauf.
 */
function startSolver() {
    const messageElement = document.getElementById(MESSAGE_ID);
    const button = document.getElementById(SOLVE_BUTTON_ID);
    
    if (!messageElement || !button) return;

    button.disabled = true;
    messageElement.textContent = 'Lösung wird berechnet...';
    messageElement.style.color = '#0073b1';
    
    const overlayElement = document.getElementById(SOLUTION_OVERLAY_ID);
    if (overlayElement) {
        overlayElement.style.display = 'none';
    }

    const gridData = getGridFromDOM(); 

    if (!gridData) {
        messageElement.textContent = `Fehler: Konnte Gitter nicht auslesen. Bitte Konsole für Debugging prüfen! ❌`;
        messageElement.style.color = '#ff0000';
        button.disabled = false;
        return;
    }
    
    const { grid: initialGrid, cells: containers } = gridData; // containers sind die DOM-Elemente
    const gridToSolve = initialGrid.map(row => [...row]); 

    setTimeout(() => {
        try {
            const startTime = performance.now();
            if (typeof solveSudoku === 'undefined') {
                 throw new Error("solveSudoku Funktion nicht gefunden. Ist solver.js geladen?");
            }
            const solved = solveSudoku(gridToSolve); 
            const endTime = performance.now();

            if (solved) {
                // Zustand speichern
                appState.initialGrid = initialGrid;
                appState.solvedGrid = gridToSolve;
                appState.containers = containers;
                
                // Übergibt das INITIAL-Grid und das SOLVED-Grid
                displaySolutionOverlay(initialGrid, gridToSolve); 
                messageElement.textContent = `Lösung bereit. Klicken Sie auf eine Ziffer, um sie einzutragen.`;
                messageElement.style.color = '#008000';
            } else {
                messageElement.textContent = 'Fehler: Konnte keine Lösung finden (ungültiges Startgitter). ❌';
                messageElement.style.color = '#ff0000';
            }
        } catch (e) {
             messageElement.textContent = 'Ein unerwarteter Fehler im Solver ist aufgetreten. ❌';
             messageElement.style.color = '#ff0000';             
        } finally {
            button.disabled = false;
        }
    }, 10);
}


/**
 * Entfernt die gesamte Solver UI aus dem DOM.
 */
function removeSolverUI() {
    const uiContainer = document.querySelector(`.${SOLVER_UI_CLASS}`);
    const overlay = document.getElementById(SOLUTION_OVERLAY_ID);
    if (uiContainer) {
        uiContainer.remove();
    }
    if (overlay) {
        overlay.remove();
    }
    appState.isInitialized = false;
}


/**
 * Erstellt die einfache Solver-UI und hängt sie an die Seite an.
 */
function createSolverUI() {
    // Wenn UI bereits existiert, nichts tun.
    if (appState.isInitialized) {
        return;
    }

    const container = document.createElement('div');
    container.className = SOLVER_UI_CLASS;
    container.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: white;
        border: 1px solid #ccc;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        padding: 15px;
        z-index: 10000;
        font-family: 'Inter', sans-serif;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: 250px;
    `;

    // Title
    const title = document.createElement('h3');
    title.textContent = 'Mini Sudoku Solver';
    title.style.cssText = `
        margin: 0 0 5px 0;
        font-size: 16px;
        color: #0073b1;
    `;
    container.appendChild(title);

    // Message/Status
    const message = document.createElement('p');
    message.id = MESSAGE_ID;
    message.textContent = 'Warte auf Sudoku Gitter...';
    message.style.cssText = `
        margin: 0;
        font-size: 12px;
        color: #555;
    `;
    container.appendChild(message);

    // Haupt-Button (Lösung anzeigen)
    const button = document.createElement('button');
    button.id = SOLVE_BUTTON_ID;
    button.textContent = 'Lösung berechnen & anzeigen'; 
    button.style.cssText = `
        background-color: #0073b1;
        color: white;
        border: none;
        padding: 8px 15px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        transition: background-color 0.2s;
        opacity: 0.5;
    `;
    button.disabled = true;
    button.onmouseover = () => button.style.backgroundColor = '#005284';
    button.onmouseout = () => button.style.backgroundColor = '#0073b1';
    button.onclick = startSolver;
    container.appendChild(button);

    document.body.appendChild(container);

    // Lösungs-Overlay-Struktur
    const overlay = document.createElement('div');
    overlay.id = SOLUTION_OVERLAY_ID;
    overlay.style.cssText = `
        display: none; 
        position: fixed;
        right: 20px;
        bottom: 200px;
        z-index: 10000;
        background: white;
        border: 1px solid #ccc;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        padding: 10px;
        text-align: center;
    `;
    document.body.appendChild(overlay);

    // Modal-Inhalt
    const modalContent = document.createElement('div');
    modalContent.innerHTML = `
        <h4 style="margin: 0 0 10px 0; color: #0073b1;">Lösung</h4>
        <div class="solver-solution-grid" style="
            display: grid;
            grid-template-columns: repeat(6, 30px);
            grid-template-rows: repeat(6, 30px);
            border: 2px solid #555;
            margin: 0 auto 10px auto;
        ">
            <!-- Zellen werden hier von displaySolutionOverlay() eingefügt -->
        </div>
    `;
    overlay.appendChild(modalContent);
    
    // Ausblenden-Button (mit EventListener statt onclick)
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Ausblenden';
    closeButton.style.cssText = `
        background-color: #f0f0f0;
        color: #333;
        border: 1px solid #ccc;
        padding: 5px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
    `;
    // Der Event-Listener, der das Overlay versteckt
    closeButton.addEventListener('click', () => {
        const overlay = document.getElementById(SOLUTION_OVERLAY_ID);
        if (overlay) overlay.style.display = 'none';
    });
    overlay.appendChild(closeButton);
    
    appState.isInitialized = true;
}


/**
 * Wartet, bis das Sudoku-Gitter (36 Zellen) im DOM existiert, bevor die UI angezeigt wird.
 */
function waitForGridAndInit() {
    
    createSolverUI();
    
    // Ab hier existiert das UI, daher können wir die Elemente sicher abrufen
    const button = document.getElementById(SOLVE_BUTTON_ID);
    const messageElement = document.getElementById(MESSAGE_ID);
    
    if (!button || !messageElement) return; // Sollte nach createSolverUI nicht passieren

    // Prüfen, ob das Gitter vorhanden ist
    const cells = getGridContainers();
    
    if (cells) { 
        messageElement.textContent = 'Bereit zum Anzeigen der Lösung.'; 
        messageElement.style.color = '#0073b1';
        button.disabled = false;
        button.style.opacity = '1';
    } else if (retryCount < MAX_RETRIES) {
        retryCount++;
        messageElement.textContent = `Warte auf Gitter... Versuch ${retryCount}/${MAX_RETRIES}`;
        setTimeout(waitForGridAndInit, 200); 
    } else {
        // Wenn das Gitter nach max. Versuchen nicht gefunden wurde,
        // wird die gesamte UI entfernt, um einen sauberen Neustart zu ermöglichen.
        removeSolverUI(); 
    }
}

/**
 * Startet den Initialisierungs-Workflow.
 */
function initializeSolver() {
    if (appState.isInitialized) return; // Verhindert doppelten Start
    
    removeSolverUI(); // Stellt einen sauberen Zustand her
    retryCount = 0;
    
    // Startet die asynchrone Prüfung, ob das Gitter stabil ist (100ms Verzögerung)
    setTimeout(waitForGridAndInit, 100); 
}

// --- DOM-PRÄSENZ-BEOBACHTUNG MIT MUTATION OBSERVER ---

const handleVisibility = () => {
    // Prüft, ob das Gitter existiert (36 Zellen müssen gefunden werden)
    const gridExists = document.querySelectorAll(CELL_SELECTOR).length === 36;
    
    if (gridExists) {
        // Das Gitter existiert, aber die UI wurde noch nicht initialisiert -> Start
        if (!appState.isInitialized) {
            initializeSolver();
        }
    } else {
        // Das Gitter ist verschwunden, aber die UI ist noch da -> Entfernen
        if (appState.isInitialized) {
            removeSolverUI();
        }
    }
};

/**
 * Initialisiert den MutationObserver, um DOM-Änderungen zu erkennen.
 */
function setupMutationObserver() {
    // Observer, der bei jeder DOM-Änderung handleVisibility auslöst
    const observer = new MutationObserver(handleVisibility);
    
    // Konfiguration: Beobachte Kind-Knoten-Listen-Änderungen im gesamten Unterbaum
    const config = { childList: true, subtree: true };
    
    // Starte die Beobachtung des gesamten Body-Elements
    observer.observe(document.body, config);
    
    // Führe die anfängliche Prüfung durch, falls das Gitter schon beim Laden existiert
    handleVisibility();
}

// Ersetzt den Polling-Loop durch den MutationObserver
setupMutationObserver();

})(); // ENDE IIFE