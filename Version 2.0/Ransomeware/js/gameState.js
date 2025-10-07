/**
 * Global Game State Management for SOC Analyst Game
 * Handles cross-page state persistence and synchronization
 */

// Global game state structure
const INITIAL_GAME_STATE = {
    totalScore: 0,
    totalIocsFound: 0,
    totalIocsAvailable: 12, // Sum of all IoCs across all rooms
    timeLeft: 3600, // 60 minutes in seconds
    gameStartTime: null,
    gameActive: false,
    roomsCompleted: [],
    roomScores: {
        network: 0,
        filesystem: 0, 
        processes: 0,
        authentication: 0,
        registry: 0,
        downloads: 0
    },
    roomIocs: {
        network: { found: 0, total: 3 },
        filesystem: { found: 0, total: 3 },
        processes: { found: 0, total: 2 },
        authentication: { found: 0, total: 2 },
        registry: { found: 0, total: 2 },
        downloads: { found: 0, total: 1 }
    },
    lastVisitedRoom: null,
    gameCompletionTime: null
};

/**
 * Get initial game state
 */
function getInitialGameState() {
    return JSON.parse(JSON.stringify(INITIAL_GAME_STATE));
}

/**
 * Save game state to localStorage
 */
function saveGameState(gameState) {
    try {
        localStorage.setItem('socGameState', JSON.stringify(gameState));
        console.log('Game state saved:', gameState);
    } catch (error) {
        console.error('Failed to save game state:', error);
    }
}

/**
 * Load game state from localStorage
 */
function loadGameState() {
    try {
        const saved = localStorage.getItem('socGameState');
        if (saved) {
            const state = JSON.parse(saved);
            // Ensure all required properties exist (backward compatibility)
            return { ...getInitialGameState(), ...state };
        }
    } catch (error) {
        console.error('Failed to load game state:', error);
    }
    return getInitialGameState();
}

/**
 * Initialize game state (called from instruction.html)
 */
function initializeGameState() {
    const state = getInitialGameState();
    state.gameStartTime = Date.now();
    saveGameState(state);
    return state;
}

/**
 * Start the game timer (called when entering first room)
 */
function startGameTimer() {
    const state = loadGameState();
    if (!state.gameActive) {
        state.gameActive = true;
        state.gameStartTime = Date.now();
        saveGameState(state);
    }
    return state;
}

/**
 * Update global counters when IoCs are found
 */
function updateGlobalCounters(scoreChange, iocsChange, roomName) {
    const state = loadGameState();
    
    // Update totals
    state.totalScore = Math.max(0, state.totalScore + scoreChange);
    state.totalIocsFound = Math.max(0, state.totalIocsFound + iocsChange);
    
    // Update room-specific data
    if (roomName && state.roomScores.hasOwnProperty(roomName)) {
        state.roomScores[roomName] = Math.max(0, state.roomScores[roomName] + scoreChange);
        
        if (iocsChange > 0 && state.roomIocs[roomName]) {
            state.roomIocs[roomName].found = Math.min(
                state.roomIocs[roomName].found + iocsChange,
                state.roomIocs[roomName].total
            );
        }
        
        state.lastVisitedRoom = roomName;
        
        // Check if room is completed
        if (state.roomIocs[roomName] && 
            state.roomIocs[roomName].found >= state.roomIocs[roomName].total &&
            !state.roomsCompleted.includes(roomName)) {
            state.roomsCompleted.push(roomName);
        }
    }
    
    // Check for game completion
    if (state.totalIocsFound >= state.totalIocsAvailable) {
        state.gameCompletionTime = Date.now();
        state.gameActive = false;
    }
    
    saveGameState(state);
    broadcastStateUpdate();
    return state;
}

/**
 * Update game timer
 */
function updateGameTimer(timeLeft) {
    const state = loadGameState();
    state.timeLeft = Math.max(0, timeLeft);
    
    if (state.timeLeft <= 0) {
        state.gameActive = false;
    }
    
    saveGameState(state);
    broadcastStateUpdate();
    return state;
}

/**
 * Get time remaining based on start time
 */
function getTimeRemaining() {
    const state = loadGameState();
    if (!state.gameActive || !state.gameStartTime) {
        return state.timeLeft;
    }
    
    const elapsed = Math.floor((Date.now() - state.gameStartTime) / 1000);
    const remaining = Math.max(0, 3600 - elapsed); // 60 minutes total
    
    // Update the state with calculated time
    if (remaining !== state.timeLeft) {
        state.timeLeft = remaining;
        saveGameState(state);
    }
    
    return remaining;
}

/**
 * Reset game state
 */
function resetGameState() {
    const state = getInitialGameState();
    saveGameState(state);
    broadcastStateUpdate();
    return state;
}

/**
 * Check if room is completed
 */
function isRoomCompleted(roomName) {
    const state = loadGameState();
    return state.roomsCompleted.includes(roomName);
}

/**
 * Get room completion status
 */
function getRoomProgress(roomName) {
    const state = loadGameState();
    if (state.roomIocs[roomName]) {
        return {
            found: state.roomIocs[roomName].found,
            total: state.roomIocs[roomName].total,
            completed: state.roomIocs[roomName].found >= state.roomIocs[roomName].total
        };
    }
    return { found: 0, total: 0, completed: false };
}

/**
 * Broadcast state changes to all open pages
 */
function broadcastStateUpdate() {
    try {
        window.dispatchEvent(new CustomEvent('gameStateUpdate', {
            detail: loadGameState()
        }));
    } catch (error) {
        console.error('Failed to broadcast state update:', error);
    }
}

/**
 * Listen for state changes from other pages
 */
function setupStateListener(callback) {
    window.addEventListener('gameStateUpdate', (event) => {
        if (typeof callback === 'function') {
            callback(event.detail);
        }
    });
    
    // Also listen for storage events (cross-tab synchronization)
    window.addEventListener('storage', (event) => {
        if (event.key === 'socGameState') {
            try {
                const newState = JSON.parse(event.newValue);
                if (typeof callback === 'function') {
                    callback(newState);
                }
            } catch (error) {
                console.error('Failed to parse storage event:', error);
            }
        }
    });
}

/**
 * Format time for display
 */
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculate final score with time bonus
 */
function calculateFinalScore(baseScore, timeLeft, totalTime = 3600) {
    const timeBonus = Math.floor((timeLeft / totalTime) * 500);
    return baseScore + timeBonus;
}

/**
 * Get game statistics for final results
 */
function getGameStatistics() {
    const state = loadGameState();
    const totalTime = 3600; // 60 minutes
    const timeUsed = totalTime - state.timeLeft;
    const completionPercentage = Math.floor((state.totalIocsFound / state.totalIocsAvailable) * 100);
    
    return {
        totalScore: state.totalScore,
        timeUsed: timeUsed,
        timeUsedFormatted: formatTime(timeUsed),
        iocsFound: state.totalIocsFound,
        totalIocs: state.totalIocsAvailable,
        completionPercentage: completionPercentage,
        roomsCompleted: state.roomsCompleted.length,
        totalRooms: Object.keys(state.roomIocs).length,
        roomBreakdown: state.roomScores,
        finalScore: calculateFinalScore(state.totalScore, state.timeLeft),
        gameCompleted: state.totalIocsFound >= state.totalIocsAvailable,
        gameStartTime: state.gameStartTime,
        gameCompletionTime: state.gameCompletionTime
    };
}

// Export functions for use in other scripts
window.GameState = {
    getInitialGameState,
    saveGameState,
    loadGameState,
    initializeGameState,
    startGameTimer,
    updateGlobalCounters,
    updateGameTimer,
    getTimeRemaining,
    resetGameState,
    isRoomCompleted,
    getRoomProgress,
    broadcastStateUpdate,
    setupStateListener,
    formatTime,
    calculateFinalScore,
    getGameStatistics
};