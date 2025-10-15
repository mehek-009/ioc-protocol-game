/**
 * Insider Threat Room Flow Management System
 * Handles sequential room unlocking, global state, and cross-page synchronization
 */

class InsiderRoomFlow {
    static ROOM_ORDER = ['database-access', 'file-server-logs', 'sharepoint-logs', 'authentication-insider', 'host-forensics', 'network-analysis-insider'];
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
            totalIocsAvailable: 15,
            globalTimeLeft: this.GLOBAL_TIME_LIMIT,
            gameStartTime: null,
            roomsCompleted: [],
            roomOrder: this.ROOM_ORDER,
            roomUnlocked: ['database-access'],
            roomScores: {
                'database-access': 0,
                'file-server-logs': 0,
                'sharepoint-logs': 0,
                'authentication-insider': 0,
                'host-forensics': 0,
                'network-analysis-insider': 0
            },
            roomIocs: {
                'database-access': { found: 0, total: 4 },
                'file-server-logs': { found: 0, total: 3 },
                'sharepoint-logs': { found: 0, total: 3 },
                'authentication-insider': { found: 0, total: 3 },
                'host-forensics': { found: 0, total: 2 },
                'network-analysis-insider': { found: 0, total: 2 }
            },
            roomTimers: {
                'database-access': this.ROOM_TIME_LIMIT,
                'file-server-logs': this.ROOM_TIME_LIMIT,
                'sharepoint-logs': this.ROOM_TIME_LIMIT,
                'authentication-insider': this.ROOM_TIME_LIMIT,
                'host-forensics': this.ROOM_TIME_LIMIT,
                'network-analysis-insider': this.ROOM_TIME_LIMIT
            },
            roomStartTimes: {},
            currentRoom: null,
            lastVisitedRoom: null,
            gameCompleted: false
        };
    }

    static registerTab() {
        try {
            const key = 'insiderOpenTabs';
            const current = parseInt(localStorage.getItem(key) || '0', 10) || 0;
            localStorage.setItem(key, String(current + 1));
            return current + 1;
        } catch (e) {
            return 1;
        }
    }

    static unregisterTab() {
        try {
            const key = 'insiderOpenTabs';
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
        
        if (this._cachedState && (now - this._cacheTime) < this.CACHE_DURATION) {
            return { ...this._cachedState };
        }
        
        try {
            const saved = localStorage.getItem('insiderGameState');
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
            this._cachedState = { ...state };
            this._cacheTime = Date.now();
            
            if (immediate) {
                localStorage.setItem('insiderGameState', JSON.stringify(state));
                this.broadcastStateUpdate(state);
                this._lastSaveTime = Date.now();
            } else {
                clearTimeout(this._saveTimeout);
                this._saveTimeout = setTimeout(() => {
                    localStorage.setItem('insiderGameState', JSON.stringify(state));
                    this.broadcastStateUpdate(state);
                    this._lastSaveTime = Date.now();
                }, 200);
            }
        } catch (error) {
            console.error('Failed to save game state:', error);
        }
    }
    
    static broadcastStateUpdate(state) {
        window.dispatchEvent(new CustomEvent('gameStateUpdate', { detail: state }));
    }
    
    static initializeGame() {
        const state = this.getInitialGameState();
        state.gameStartTime = Date.now();
        this.saveGameState(state, true);
        return state;
    }
    
    static enterRoom(roomName) {
        const state = this.loadGameState();
        
        if (!state.roomUnlocked.includes(roomName) && roomName !== 'database-access') {
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
        this.saveGameState(state, true);
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
        
        this.saveGameState(state, true);
        return state;
    }
    
    static getGlobalTimeRemaining(saveState = false) {
        const state = this.loadGameState();
        if (!state.gameStartTime) return state.globalTimeLeft;
        
        if (state.gameCompleted) {
            return state.globalTimeLeft;
        }
        
        const elapsed = Math.floor((Date.now() - state.gameStartTime) / 1000);
        const remaining = Math.max(0, this.GLOBAL_TIME_LIMIT - elapsed);
        
        if (saveState && (Date.now() - this._lastSaveTime) > 5000) {
            state.globalTimeLeft = remaining;
            if (remaining <= 0 && !state.gameCompleted) {
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
        
        if (!currentRoom || ['index', 'convo', 'mission'].includes(currentRoom)) {
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
        localStorage.removeItem('insiderGameState');
        localStorage.removeItem('insiderPausedRemaining');
        localStorage.removeItem('insiderOpenTabs');
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
        if (window._stateListenerAttached) return;
        window._stateListenerAttached = true;
        
        window.addEventListener('gameStateUpdate', (event) => {
            if (typeof callback === 'function') {
                callback(event.detail);
            }
        });
        
        window.addEventListener('storage', (event) => {
            if (event.key === 'insiderGameState' && event.newValue) {
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

    static restorePausedTimeIfNeeded() {
        try {
            const key = 'insiderPausedRemaining';
            const raw = localStorage.getItem(key);
            if (!raw) return;
            const paused = parseInt(raw, 10);
            if (isNaN(paused)) return;

            const state = this.loadGameState();
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
            'database-access': 'Database Access Logs',
            'file-server-logs': 'File Server Access',
            'sharepoint-logs': 'SharePoint Portal Logs',
            'authentication-insider': 'Authentication Analysis',
            'host-forensics': 'Host Forensics',
            'network-analysis-insider': 'Network Traffic Analysis'
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
window.InsiderRoomIntegration = {
    
    initializeRoom: function(roomName, iocsTotal) {
        console.log(`Initializing room: ${roomName}`);
        
        if (!InsiderRoomFlow.redirectIfLocked()) {
            return false;
        }
        
        InsiderRoomFlow.startTimer();
        this.setupGlobalDisplayUpdates();
        this.updateAllDisplays();
        
        return true;
    },
    
    updateAllDisplays: function() {
        const state = InsiderRoomFlow.loadGameState();
        const currentRoom = InsiderRoomFlow.getCurrentRoom();
        
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
            const timeRemaining = InsiderRoomFlow.getGlobalTimeRemaining(true);
            timerElement.textContent = InsiderRoomFlow.formatTime(timeRemaining);
            
            if (timeRemaining <= 300) {
                timerElement.style.color = '#FF6666';
                timerElement.style.animation = 'pulse 2s ease-in-out infinite';
            } else if (timeRemaining <= 600) {
                timerElement.style.color = '#FFFF00';
            } else {
                timerElement.style.color = '#00FF41';
                timerElement.style.animation = 'none';
            }
            
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
        
        InsiderRoomFlow.setupStateListener((state) => {
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
        
        const state = InsiderRoomFlow.updateRoomProgress(roomName, scoreChange, iocsChange);
        this.updateAllDisplays();
        
        if (state.roomIocs[roomName].found >= state.roomIocs[roomName].total) {
            setTimeout(() => {
                this.showRoomCompletion(roomName, state);
            }, 1500);
        }
        
        return state;
    },
    
    showRoomCompletion: function(roomName, state) {
        window.location.href = 'index.html';
    },
    
    endGame: function(reason) {
        const state = InsiderRoomFlow.loadGameState();
        
        if (reason === 'timeout') {
            InsiderRoomFlow.resetGame();
            window.location.href = '../dashboard.html';
        } else if (reason === 'completed') {
            InsiderRoomFlow.saveGameState(state, true);
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

window.InsiderRoomFlow = InsiderRoomFlow;

document.addEventListener('DOMContentLoaded', function() {
    const currentRoom = InsiderRoomFlow.getCurrentRoom();
    if (currentRoom && currentRoom !== 'index' && currentRoom !== 'convo' && currentRoom !== 'mission') {
        InsiderRoomIntegration.initializeRoom(currentRoom);
    }
});

try {
    InsiderRoomFlow.registerTab();
    InsiderRoomFlow.restorePausedTimeIfNeeded();
} catch (e) {
    // ignore
}

window.addEventListener('beforeunload', () => {
    try {
        const remaining = InsiderRoomFlow.getGlobalTimeRemaining(true);
        const next = InsiderRoomFlow.unregisterTab();
        if (next === 0) {
            localStorage.setItem('insiderPausedRemaining', String(remaining));
        }
    } catch (e) {
        // ignore
    }
});