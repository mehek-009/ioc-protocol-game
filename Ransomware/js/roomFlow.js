/**
 * Complete Room Flow Management System - FIXED IoC COUNTS
 * The totalIocsAvailable must match the sum of all room IoC totals
 * downloads(5) + processes(4) + authentication(2) + network(3) + registry(4) + filesystem(7) = 25
 */

class RoomFlow {
    static ROOM_ORDER = ['downloads', 'processes', 'authentication', 'network', 'registry', 'filesystem'];
    static ROOM_TIME_LIMIT = 600; // 10 minutes per room
    static GLOBAL_TIME_LIMIT = 3600; // 60 minutes total
    
    // Performance optimization: state caching
    static _cachedState = null;
    static _cacheTime = 0;
    static CACHE_DURATION = 500; // 500ms cache
    
    // Performance optimization: debounced saves
    static _saveTimeout = null;
    static _lastSaveTime = 0;
    
    static getInitialGameState() {
        return {
            totalScore: 0,
            totalIocsFound: 0,
            totalIocsAvailable: 25, // FIXED: Was 19, should be 25
            globalTimeLeft: this.GLOBAL_TIME_LIMIT,
            gameStartTime: null,
            roomsCompleted: [],
            roomOrder: this.ROOM_ORDER,
            roomUnlocked: ['downloads'],
            roomScores: {
                downloads: 0, processes: 0, authentication: 0,
                registry: 0, network: 0, filesystem: 0
            },
            roomIocs: {
                downloads: { found: 0, total: 5 },    // Matches downloads.html
                processes: { found: 0, total: 4 },    // Matches processes.html  
                authentication: { found: 0, total: 2 }, // Matches authentication.html
                network: { found: 0, total: 3 },      // Matches network.html
                registry: { found: 0, total: 4 },     // Matches registry.html
                filesystem: { found: 0, total: 7 }    // Matches filesystem.html
            },
            roomTimers: {
                downloads: this.ROOM_TIME_LIMIT, processes: this.ROOM_TIME_LIMIT,
                authentication: this.ROOM_TIME_LIMIT, registry: this.ROOM_TIME_LIMIT,
                network: this.ROOM_TIME_LIMIT, filesystem: this.ROOM_TIME_LIMIT
            },
            roomStartTimes: {},
            currentRoom: null,
            lastVisitedRoom: null,
            gameCompleted: false
        };
    }

    // Simple tab-counting helpers for pausing when last tab closes
    static registerTab() {
        try {
            const key = 'socOpenTabs';
            const current = parseInt(localStorage.getItem(key) || '0', 10) || 0;
            localStorage.setItem(key, String(current + 1));
            return current + 1;
        } catch (e) {
            return 1;
        }
    }

    static unregisterTab() {
        try {
            const key = 'socOpenTabs';
            const current = parseInt(localStorage.getItem(key) || '0', 10) || 0;
            const next = Math.max(0, current - 1);
            if (next === 0) {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, String(next));
            }
            return next;
        } catch (e) {
            return 0;
        }
    }
    
    static loadGameState() {
        const now = Date.now();
        
        // Return cached state if fresh
        if (this._cachedState && (now - this._cacheTime) < this.CACHE_DURATION) {
            return { ...this._cachedState };
        }
        
        try {
            const saved = localStorage.getItem('socGameState');
            if (saved) {
                const state = JSON.parse(saved);
                this._cachedState = { ...this.getInitialGameState(), ...state };
                this._cacheTime = now;
                return { ...this._cachedState };
            }
        } catch (error) {
            console.error('Failed to load game state:', error);
        }
        
        this._cachedState = this.getInitialGameState();
        this._cacheTime = now;
        return { ...this._cachedState };
    }
    
    static saveGameState(state, immediate = false) {
        try {
            // Update cache immediately
            this._cachedState = { ...state };
            this._cacheTime = Date.now();
            
            if (immediate) {
                // Save immediately (for critical operations)
                localStorage.setItem('socGameState', JSON.stringify(state));
                this.broadcastStateUpdate(state);
                this._lastSaveTime = Date.now();
            } else {
                // Debounce saves - only save after 200ms of no changes
                clearTimeout(this._saveTimeout);
                this._saveTimeout = setTimeout(() => {
                    localStorage.setItem('socGameState', JSON.stringify(state));
                    this.broadcastStateUpdate(state);
                    this._lastSaveTime = Date.now();
                }, 200);
            }
        } catch (error) {
            console.error('Failed to save game state:', error);
        }
    }
    
    static broadcastStateUpdate(state) {
        // Only dispatch custom event - storage event fires automatically
        window.dispatchEvent(new CustomEvent('gameStateUpdate', { detail: state }));
    }
    
    static initializeGame() {
        const state = this.getInitialGameState();
        state.gameStartTime = Date.now();
        this.saveGameState(state, true); // Immediate save
        return state;
    }
    
    static enterRoom(roomName) {
        const state = this.loadGameState();
        
        if (!state.roomUnlocked.includes(roomName) && roomName !== 'downloads') {
            alert(`Room Locked!\n\nComplete previous rooms in order:\n${this.ROOM_ORDER.slice(0, this.ROOM_ORDER.indexOf(roomName)).join(' → ')}`);
            return false;
        }
        
        if (!state.gameStartTime) {
            state.gameStartTime = Date.now();
        }
        
        if (!state.roomStartTimes[roomName]) {
            state.roomStartTimes[roomName] = Date.now();
        }
        
        state.currentRoom = roomName;
        state.lastVisitedRoom = roomName;
        this.saveGameState(state, true); // Immediate save
        return true;
    }
    
    static updateRoomProgress(roomName, scoreChange, iocsChange) {
        const state = this.loadGameState();
        
        const newIocsFound = Math.max(0, Math.min(
            state.roomIocs[roomName].found + iocsChange,
            state.roomIocs[roomName].total
        ));
        const actualIocsChange = newIocsFound - state.roomIocs[roomName].found;
        
        state.totalScore = Math.max(0, state.totalScore + scoreChange);
        state.totalIocsFound = Math.max(0, state.totalIocsFound + actualIocsChange);
        state.roomScores[roomName] = Math.max(0, state.roomScores[roomName] + scoreChange);
        state.roomIocs[roomName].found = newIocsFound;
        
        const roomData = state.roomIocs[roomName];
        const isRoomCompleted = roomData.found >= roomData.total;
        
        if (isRoomCompleted && !state.roomsCompleted.includes(roomName)) {
            state.roomsCompleted.push(roomName);
            
            const roomIndex = this.ROOM_ORDER.indexOf(roomName);
            if (roomIndex !== -1 && roomIndex + 1 < this.ROOM_ORDER.length) {
                const nextRoom = this.ROOM_ORDER[roomIndex + 1];
                if (!state.roomUnlocked.includes(nextRoom)) {
                    state.roomUnlocked.push(nextRoom);
                    this.showRoomUnlockedNotification(nextRoom);
                }
            }
        }
        
        if (state.totalIocsFound >= state.totalIocsAvailable) {
            state.gameCompleted = true;
        }
        
        this.saveGameState(state, true); // Immediate save for progress
        return state;
    }
    
    static getGlobalTimeRemaining(saveState = false) {
        const state = this.loadGameState();
        if (!state.gameStartTime) return state.globalTimeLeft;
        
        // If game is completed, stop the timer
        if (state.gameCompleted) {
            return state.globalTimeLeft;
        }
        
        const elapsed = Math.floor((Date.now() - state.gameStartTime) / 1000);
        const remaining = Math.max(0, this.GLOBAL_TIME_LIMIT - elapsed);
        
        // Only save every 5 seconds to reduce I/O
        if (saveState && (Date.now() - this._lastSaveTime) > 5000) {
            state.globalTimeLeft = remaining;
            if (remaining <= 0 && !state.gameCompleted) {
                // Only mark as completed by timeout if not already completed
                state.gameCompleted = true;
                state.completedByTimeout = true;
            }
            this.saveGameState(state);
        }
        
        return remaining;
    }
    
    static getRoomTimeRemaining(roomName) {
        const state = this.loadGameState();
        const roomStartTime = state.roomStartTimes[roomName];
        
        if (!roomStartTime) return this.ROOM_TIME_LIMIT;
        
        const elapsed = Math.floor((Date.now() - roomStartTime) / 1000);
        return Math.max(0, this.ROOM_TIME_LIMIT - elapsed);
    }
    
    static isRoomUnlocked(roomName) {
        const state = this.loadGameState();
        return state.roomUnlocked.includes(roomName);
    }
    
    static isRoomCompleted(roomName) {
        const state = this.loadGameState();
        return state.roomsCompleted.includes(roomName);
    }
    
    static getCurrentRoom() {
        const path = window.location.pathname;
        const roomName = path.substring(path.lastIndexOf('/') + 1, path.lastIndexOf('.'));
        return roomName === 'index' ? null : roomName;
    }
    
    static redirectIfLocked() {
        const currentRoom = this.getCurrentRoom();
        
        if (!currentRoom || ['index', 'instruction'].includes(currentRoom)) {
            return true;
        }
        
        if (!this.isRoomUnlocked(currentRoom)) {
            const roomIndex = this.ROOM_ORDER.indexOf(currentRoom);
            const requiredRooms = this.ROOM_ORDER.slice(0, roomIndex);
            
            alert(`This room is locked!\n\nComplete these rooms first:\n${requiredRooms.join(' → ')}`);
            window.location.href = 'index.html';
            return false;
        }
        
        this.enterRoom(currentRoom);
        return true;
    }
    
    static startTimer() {
        const state = this.loadGameState();
        if (!state.gameStartTime) {
            state.gameStartTime = Date.now();
            this.saveGameState(state, true);
        }
    }
    
    static formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
    
    static resetGame() {
        localStorage.removeItem('socGameState');
        localStorage.removeItem('socPausedRemaining');
        localStorage.removeItem('socOpenTabs');
        this._cachedState = null;
        this._cacheTime = 0;
        this.broadcastStateUpdate(this.getInitialGameState());
    }
    
    static getGameStatistics() {
        const state = this.loadGameState();
        const timeUsed = this.GLOBAL_TIME_LIMIT - state.globalTimeLeft;
        
        return {
            totalScore: state.totalScore,
            totalIocsFound: state.totalIocsFound,
            totalIocsAvailable: state.totalIocsAvailable,
            timeUsed: this.formatTime(timeUsed),
            completionPercentage: Math.floor((state.totalIocsFound / state.totalIocsAvailable) * 100),
            roomsCompleted: state.roomsCompleted.length,
            totalRooms: this.ROOM_ORDER.length,
            roomBreakdown: state.roomScores,
            gameCompleted: state.gameCompleted,
            completedByTimeout: state.completedByTimeout || false,
            perfectScore: state.totalIocsFound === state.totalIocsAvailable && timeUsed < this.GLOBAL_TIME_LIMIT
        };
    }
    
    static setupStateListener(callback) {
        // Prevent duplicate listeners
        if (window._stateListenerAttached) return;
        window._stateListenerAttached = true;
        
        window.addEventListener('gameStateUpdate', (event) => {
            if (typeof callback === 'function') {
                callback(event.detail);
            }
        });
        
        window.addEventListener('storage', (event) => {
            if (event.key === 'socGameState' && event.newValue) {
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
     * Restore paused remaining time saved when the last tab closed.
     */
    static restorePausedTimeIfNeeded() {
        try {
            const key = 'socPausedRemaining';
            const raw = localStorage.getItem(key);
            if (!raw) return;
            const paused = parseInt(raw, 10);
            if (isNaN(paused)) return;

            const state = this.loadGameState();
            // Compute elapsed such that remaining = paused
            const elapsed = this.GLOBAL_TIME_LIMIT - paused;
            state.gameStartTime = Date.now() - (elapsed * 1000);
            state.globalTimeLeft = paused;
            this.saveGameState(state, true);
            localStorage.removeItem(key);
        } catch (e) {
            console.error('Failed to restore paused time:', e);
        }
    }
    
    static showRoomUnlockedNotification(roomName) {
        const roomNames = {
            downloads: 'Download Analysis',
            processes: 'Process Monitor',
            authentication: 'Authentication Logs',
            network: 'Network Traffic Analysis', 
            registry: 'Registry Analysis',
            filesystem: 'File System Analysis'
        };
        
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            border: 2px solid #00ff41;
            border-radius: 10px;
            padding: 20px;
            color: #00ff41;
            font-family: 'Courier New', monospace;
            font-weight: bold;
            z-index: 10000;
            box-shadow: 0 0 30px rgba(0, 255, 65, 0.5);
            animation: slideInRight 0.5s ease;
            max-width: 300px;
        `;
        
        notification.innerHTML = `
            <div style="font-size: 1.2rem; margin-bottom: 10px;">🔓 ROOM UNLOCKED!</div>
            <div style="color: #00ffff;">${roomNames[roomName] || roomName}</div>
            <div style="font-size: 0.9rem; color: #88BBDD; margin-top: 5px;">Ready for investigation</div>
        `;
        
        if (!document.querySelector('#unlock-animation-style')) {
            const style = document.createElement('style');
            style.id = 'unlock-animation-style';
            style.textContent = `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideInRight 0.5s ease reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 500);
        }, 4000);
    }
}

// Universal Room Integration Functions
window.RoomIntegration = {
    
    initializeRoom: function(roomName, iocsTotal) {
        console.log(`Initializing room: ${roomName}`);
        
        if (!RoomFlow.redirectIfLocked()) {
            return false;
        }
        
        RoomFlow.startTimer();
        this.setupGlobalDisplayUpdates();
        this.updateAllDisplays();
        
        return true;
    },
    
    updateAllDisplays: function() {
        const state = RoomFlow.loadGameState();
        const currentRoom = RoomFlow.getCurrentRoom();
        
        const globalIocsElement = document.getElementById('globalIocs');
        if (globalIocsElement) {
            globalIocsElement.textContent = `${state.totalIocsFound}/${state.totalIocsAvailable}`;
        }
        
        const roomIocsElement = document.getElementById('roomIocs');
        if (roomIocsElement && currentRoom && state.roomIocs[currentRoom]) {
            const roomData = state.roomIocs[currentRoom];
            roomIocsElement.textContent = `${roomData.found}/${roomData.total}`;
        }
        
        const totalScoreElement = document.getElementById('totalScore');
        if (totalScoreElement) {
            totalScoreElement.textContent = state.totalScore;
        }
        
        const timerElement = document.getElementById('timer');
        if (timerElement) {
            const timeRemaining = RoomFlow.getGlobalTimeRemaining(true);
            timerElement.textContent = RoomFlow.formatTime(timeRemaining);
            
            if (timeRemaining <= 300) {
                timerElement.style.color = '#FF6666';
                timerElement.style.animation = 'pulse 2s ease-in-out infinite';
            } else if (timeRemaining <= 600) {
                timerElement.style.color = '#FFFF00';
            } else {
                timerElement.style.color = '#00FF41';
                timerElement.style.animation = 'none';
            }
            
            // Only end game on timeout, not on completion
            if (timeRemaining <= 0 && !state.gameCompleted) {
                this.endGame('timeout');
            }
        }
    },
    
    setupGlobalDisplayUpdates: function() {
        if (!window.globalUpdateInterval) {
            window.globalUpdateInterval = setInterval(() => {
                this.updateAllDisplays();
            }, 1000);
        }
        
        RoomFlow.setupStateListener((state) => {
            this.updateAllDisplays();
        });
        
        window.addEventListener('beforeunload', () => {
            if (window.globalUpdateInterval) {
                clearInterval(window.globalUpdateInterval);
                window.globalUpdateInterval = null;
            }
        });
    },
    
    updateProgress: function(roomName, scoreChange, iocsChange) {
        console.log(`Updating ${roomName}: score=${scoreChange}, IoCs=${iocsChange}`);
        
        const state = RoomFlow.updateRoomProgress(roomName, scoreChange, iocsChange);
        this.updateAllDisplays();
        
        if (state.roomIocs[roomName].found >= state.roomIocs[roomName].total) {
            setTimeout(() => {
                this.showRoomCompletion(roomName, state);
            }, 1500);
        }
        
        return state;
    },
    
    showRoomCompletion: function(roomName, state) {
        const roomNames = {
            downloads: 'Download Analysis',
            processes: 'Process Monitor', 
            authentication: 'Authentication Logs',
            network: 'Network Traffic Analysis',
            registry: 'Registry Analysis',
            filesystem: 'File System Analysis'
        };
        
        const roomAchievements = {
            downloads: '<p>Initial Attack Vector Identified</p><p>Malicious Download Located</p>',
            processes: '<p>Malicious Processes Detected</p><p>Resource Abuse Identified</p>',
            authentication: '<p>Compromised Credentials Found</p><p>Login Timeline Established</p>',
            network: '<p>C&C Communication Detected</p><p>Data Exfiltration Identified</p>',
            registry: '<p>Persistence Mechanisms Found</p><p>System Modifications Traced</p>',
            filesystem: '<p>Encrypted Files Located</p><p>Ransomware Impact Assessed</p>'
        };
        
        // Create backdrop
        const backdrop = document.createElement('div');
        backdrop.id = 'completion-backdrop';
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(5px);
            z-index: 9999;
            animation: fadeIn 0.3s ease;
        `;
        
        const completionMessage = document.createElement('div');
        completionMessage.id = 'completion-modal';
        completionMessage.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            padding: 40px;
            border-radius: 15px;
            border: 2px solid #00ff41;
            text-align: center;
            z-index: 10000;
            box-shadow: 0 0 50px rgba(0, 255, 65, 0.3);
            max-width: 600px;
            width: 90%;
            color: #ffffff;
            animation: slideIn 0.5s ease;
        `;
        
        // Add animations if not already present
        if (!document.querySelector('#completion-animations')) {
            const style = document.createElement('style');
            style.id = 'completion-animations';
            style.textContent = `
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideIn {
                    from { 
                        transform: translate(-50%, -60%);
                        opacity: 0;
                    }
                    to { 
                        transform: translate(-50%, -50%);
                        opacity: 1;
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        const gameStats = RoomFlow.getGameStatistics();
        let content = `
            <h2 style="color: #00ff41; margin-bottom: 20px; font-size: 2rem;">${roomNames[roomName] || roomName} Complete!</h2>
            <p style="margin-bottom: 20px; font-size: 1.1rem;">
                You've identified all IoCs in this investigation area.
            </p>
            <div style="color: #00ff41; font-size: 1.1rem; margin-bottom: 30px;">
                ${roomAchievements[roomName] || '<p>Investigation Complete</p>'}
            </div>
            <div style="margin-bottom: 20px;">
                <p style="color: #00ffff;">Room Score: ${state.roomScores[roomName]} points</p>
                <p style="color: #00ffff;">Global Score: ${state.totalScore} points</p>
                <p style="color: #00ffff;">Global IoCs: ${state.totalIocsFound}/${state.totalIocsAvailable}</p>
                <p style="color: #88BBDD;">Time Used: ${gameStats.timeUsed}</p>
            </div>
        `;
        
        if (gameStats.gameCompleted) {
            content += `
                <div style="background: rgba(0, 255, 0, 0.1); padding: 15px; border-radius: 10px; margin-bottom: 20px;">
                    <h3 style="color: #00ff41; margin-bottom: 10px;">🎉 INVESTIGATION COMPLETE!</h3>
                    <p>All IoCs found across all investigation areas!</p>
                    <p style="color: #FFFF00;">Final Score: ${gameStats.totalScore} points</p>
                </div>
            `;
        }
        
        content += `
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 20px;">
                <button id="continueBtn" style="
                    background: #00ff41;
                    color: black;
                    padding: 12px 24px;
                    border: none;
                    border-radius: 25px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 1rem;
                    transition: all 0.3s ease;
                ">Continue Investigation</button>
                <button id="replayBtn" style="
                    background: #00ffff;
                    color: black;
                    padding: 12px 24px;
                    border: none;
                    border-radius: 25px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 1rem;
                    transition: all 0.3s ease;
                ">Analyze Again</button>
            </div>
        `;
        
        completionMessage.innerHTML = content;
        
        // Append to body
        document.body.appendChild(backdrop);
        document.body.appendChild(completionMessage);
        
        // Add event listeners to buttons
        const continueBtn = document.getElementById('continueBtn');
        const replayBtn = document.getElementById('replayBtn');
        
        if (continueBtn) {
            continueBtn.addEventListener('click', function() {
                window.location.href = 'index.html';
            });
            continueBtn.addEventListener('mouseenter', function() {
                this.style.transform = 'scale(1.05)';
                this.style.boxShadow = '0 5px 20px rgba(0, 255, 65, 0.5)';
            });
            continueBtn.addEventListener('mouseleave', function() {
                this.style.transform = 'scale(1)';
                this.style.boxShadow = 'none';
            });
        }
        
        if (replayBtn) {
            replayBtn.addEventListener('click', function() {
                location.reload();
            });
            replayBtn.addEventListener('mouseenter', function() {
                this.style.transform = 'scale(1.05)';
                this.style.boxShadow = '0 5px 20px rgba(0, 255, 255, 0.5)';
            });
            replayBtn.addEventListener('mouseleave', function() {
                this.style.transform = 'scale(1)';
                this.style.boxShadow = 'none';
            });
        }
    },
    
    endGame: function(reason) {
        const state = RoomFlow.loadGameState();
        
        if (reason === 'timeout') {
            // On timeout, reset the game and go to dashboard
            RoomFlow.resetGame();
            window.location.href = '../dashboard.html';
        } else if (reason === 'completed') {
            // On completion, save the final state and do nothing else
            RoomFlow.saveGameState(state, true);
        }
    },
    
    showFeedback: function(message, type) {
        const feedback = document.getElementById('feedback');
        if (feedback) {
            feedback.textContent = message;
            feedback.className = `feedback ${type}`;
            feedback.classList.add('show');
            
            setTimeout(() => {
                feedback.classList.remove('show');
            }, 4000);
        }
    }
};

window.RoomFlow = RoomFlow;

document.addEventListener('DOMContentLoaded', function() {
    const currentRoom = RoomFlow.getCurrentRoom();
    if (currentRoom && currentRoom !== 'index' && currentRoom !== 'instruction') {
        RoomIntegration.initializeRoom(currentRoom);
    }
});

// Register tab and try to restore any paused time saved when all tabs were closed
try {
    RoomFlow.registerTab();
    RoomFlow.restorePausedTimeIfNeeded();
} catch (e) {
    // ignore
}

window.addEventListener('beforeunload', () => {
    try {
        // Persist current remaining time
        const remaining = RoomFlow.getGlobalTimeRemaining(true);
        const next = RoomFlow.unregisterTab();
        if (next === 0) {
            // Save paused remaining time for next load
            localStorage.setItem('socPausedRemaining', String(remaining));
        }
    } catch (e) {
        // ignore
    }
});