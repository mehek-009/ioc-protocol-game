/**
 * Complete Room Flow Management System - OPTIMIZED
 * Handles sequential room unlocking, global state, and cross-page synchronization
 * Performance improvements: debounced saves, state caching, reduced I/O
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
            totalIocsAvailable: 12,
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
                downloads: { found: 0, total: 1 },
                processes: { found: 0, total: 2 },
                authentication: { found: 0, total: 2 },
                registry: { found: 0, total: 2 },
                network: { found: 0, total: 3 },
                filesystem: { found: 0, total: 3 }
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
        
        const elapsed = Math.floor((Date.now() - state.gameStartTime) / 1000);
        const remaining = Math.max(0, this.GLOBAL_TIME_LIMIT - elapsed);
        
        // Only save every 5 seconds to reduce I/O
        if (saveState && (Date.now() - this._lastSaveTime) > 5000) {
            state.globalTimeLeft = remaining;
            if (remaining <= 0) {
                state.gameCompleted = true;
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
            <div style="font-size: 1.2rem; margin-bottom: 10px;">ROOM UNLOCKED!</div>
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
            const timeRemaining = RoomFlow.getGlobalTimeRemaining(true); // Save state every 5s
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
            
            if (timeRemaining <= 0) {
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
        
        const completionMessage = document.createElement('div');
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
        `;
        
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
                    <h3 style="color: #00ff41; margin-bottom: 10px;">INVESTIGATION COMPLETE!</h3>
                    <p>All IoCs found across all investigation areas!</p>
                    <p style="color: #FFFF00;">Final Score: ${gameStats.totalScore} points</p>
                </div>
            `;
        }
        
        content += `
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 20px;">
                <a href="index.html" style="
                    background: #00ff41;
                    color: black;
                    padding: 12px 24px;
                    text-decoration: none;
                    border-radius: 25px;
                    font-weight: bold;
                    display: inline-block;
                ">Continue Investigation</a>
                <button onclick="location.reload()" style="
                    background: #00ffff;
                    color: black;
                    padding: 12px 24px;
                    border: none;
                    border-radius: 25px;
                    cursor: pointer;
                    font-weight: bold;
                ">Analyze Again</button>
            </div>
        `;
        
        completionMessage.innerHTML = content;
        document.body.appendChild(completionMessage);
    },
    
    endGame: function(reason) {
        const state = RoomFlow.loadGameState();
        const stats = RoomFlow.getGameStatistics();
        
        let message = '';
        if (reason === 'timeout') {
            message = `Time's Up!\n\nIoCs Found: ${state.totalIocsFound}/12\nFinal Score: ${state.totalScore}\nThe investigation could not be completed in time.`;
        } else if (reason === 'completed') {
            message = `Investigation Complete!\n\nAll IoCs Found: ${state.totalIocsFound}/12\nFinal Score: ${state.totalScore}\nTime Used: ${stats.timeUsed}`;
        }
        
        setTimeout(() => {
            alert(message);
            if (confirm('Would you like to start a new investigation?')) {
                RoomFlow.resetGame();
                window.location.href = 'instruction.html';
            } else {
                window.location.href = 'index.html';
            }
        }, 1000);
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