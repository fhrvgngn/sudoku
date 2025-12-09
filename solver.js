/**
 * Sudoku-Löser-Logik für das 6x6 Mini-Sudoku (2x3 Blöcke).
 */

/**
 * Überprüft, ob eine Zahl an einer bestimmten Position gültig ist.
 * @param {number[][]} grid - Das 6x6 Sudoku-Gitter.
 * @param {number} row - Die Zeile (0-5).
 * @param {number} col - Die Spalte (0-5).
 * @param {number} num - Die zu überprüfende Zahl (1-6).
 * @returns {boolean} - True, wenn die Zahl gültig ist, ansonsten False.
 */
function isSafe(grid, row, col, num) {
    // 1. Zeilenprüfung
    for (let c = 0; c < 6; c++) {
        if (grid[row][c] === num) return false;
    }

    // 2. Spaltenprüfung
    for (let r = 0; r < 6; r++) {
        if (grid[r][col] === num) return false;
    }

    // 3. 2x3 Block-Prüfung
    // Berechne die Startkoordinaten des 2x3 Blocks.
    // row: 0, 1 -> Block 0; 2, 3 -> Block 2; 4, 5 -> Block 4
    // col: 0, 1, 2 -> Block 0; 3, 4, 5 -> Block 3
    const startRow = Math.floor(row / 2) * 2;
    const startCol = Math.floor(col / 3) * 3;

    for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) {
            if (grid[startRow + r][startCol + c] === num) return false;
        }
    }

    return true;
}

/**
 * Hauptfunktion zum Lösen des Sudokus mittels Backtracking.
 * @param {number[][]} grid - Das 6x6 Sudoku-Gitter (0 für leere Zellen).
 * @returns {boolean} - True, wenn eine Lösung gefunden wurde, ansonsten False.
 */
function solveSudoku(grid) {
    let emptyCell = findEmpty(grid);
    if (!emptyCell) {
        // Keine leere Zelle gefunden, das Gitter ist gelöst
        return true;
    }

    const [row, col] = emptyCell;

    // Probiere alle Zahlen von 1 bis 6
    for (let num = 1; num <= 6; num++) {
        if (isSafe(grid, row, col, num)) {
            // Zahl ist gültig, setze sie
            grid[row][col] = num;

            // Rekursiver Aufruf für die nächste Zelle
            if (solveSudoku(grid)) {
                return true;
            }

            // Backtracking: Wenn der rekursive Aufruf fehlschlägt,
            // setze die Zelle zurück und probiere die nächste Zahl
            grid[row][col] = 0;
        }
    }

    // Keine Zahl (1-6) funktioniert, es muss zurückgesprungen werden
    return false;
}

/**
 * Hilfsfunktion zum Finden der nächsten leeren Zelle.
 * @param {number[][]} grid - Das 6x6 Sudoku-Gitter.
 * @returns {[number, number] | null} - [Zeile, Spalte] der leeren Zelle oder null.
 */
function findEmpty(grid) {
    for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
            if (grid[r][c] === 0) {
                return [r, c];
            }
        }
    }
    return null;
}