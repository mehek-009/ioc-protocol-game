/**
 * Generic Room Integration Script
 * Provides common functionality for integrating individual rooms with global game state
 */

class RoomIntegration {
    constructor(roomName, totalIocs) {
        this.roomName = roomName;
        this.localState = {
            roomIocsFound: 0,
            roomScore: 0,
            totalIocs: totalIocs,
            correctSelections: 0,
            wrongSelections: 0
        };
        this.globalState = null;
        this.gameTimer = null;
        this.additionalTimers = [];
        
        // Bind methods to preserve 'this' context
        this.updateGlobalDisplay = this.updateGlobalDisplay.bind(this);
        this.handleCorrectIoc = this.handleCorrectIoc.bind(this);
        this.handleIncorrectSelection = this.handleIncorrectSelection.bind(this);
    }

    /**
     * Initialize the room integration
     */
    init() {
        // Start the global timer if not already active
        this.globalState = GameState.startGameTimer();
        
        // Set up state listener for cross-page updates
        GameState.setupStateListener(this.updateGlobalDisplay);
        
        // Start the global timer display
        this.startGlobalTimer();
        
        // Initial display update
        this.updateGlobalDisplay(this.globalState);
        
        return this.globalState;
    }

    /**
     * Start the global timer and keep it synchronized
     */
    startGlobalTimer() {
        this.gameTimer = setInterval(() => {
            const timeLeft = GameState.getTimeRemaining();
            this.updateTimerDisplay(timeLeft);
            
            if (timeLeft <= 0) {
                this.endGameDueToTimeout();
                clearInterval(this.gameTimer);
                this.clearAdditionalTimers();
            }
        }, 1000);
    }

    /**
     * Update the timer display
     */
    updateTimerDisplay(timeLeft) {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        const timerElement = document.getElementById('timer');
        
        if (timerElement) {
            timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            // Update color based on remaining time
            if (timeLeft <= 300) { // Less than 5 minutes
                timerElement.style.color = '#ff6b6b';
                timerElement.style.animation = 'pulse 2s ease-in-out infinite';
            } else if (timeLeft <= 900) { // Less than 15 minutes
                timerElement.style.color = '#ffa500';
            } else {
                timerElement.style.color = '#00ff41';
                timerElement.style.animation = 'none';
            }
        }
    }

    /**
     * Update global display elements
     */
    updateGlobalDisplay(state) {
        if (!state) return;
        
        this.globalState = state;
        
        // Update score displays
        const totalScoreElement = document.getElementById('totalScore');
        if (totalScoreElement) {
            totalScoreElement.textContent = state.totalScore || 0;
        }
        
        // Update global IoCs display
        const globalIocsElement = document.getElementById('globalIocs');
        if (globalIocsElement) {
            globalIocsElement.textContent = `${state.totalIocsFound || 0}/${state.totalIocsAvailable || 12}`;
        }
        
        // Update room IoCs display
        const roomIocsElement = document.getElementById('roomIocs');
        if (roomIocsElement) {
            roomIocsElement.textContent = `${this.localState.roomIocsFound}/${this.localState.totalIocs}`;
        }
        
        // Update timer
        const timeLeft = GameState.getTimeRemaining();
        this.updateTimerDisplay(timeLeft);
    }

    /**
     * Handle correct IoC identification
     */
    handleCorrectIoc(scoreGain = 100, explanation = 'Correct!') {
        this.localState.correctSelections++;
        this.localState.roomIocsFound++;
        this.localState.roomScore += scoreGain;
        
        // Update global state
        GameState.updateGlobalCounters(scoreGain, 1, this.roomName);
        
        // Show feedback
        this.showFeedback(explanation, 'success');
        
        // Update displays
        this.updateLocalDisplay();
        
        // Check for room completion
        if (this.localState.roomIocsFound >= this.localState.totalIocs) {
            setTimeout(() => {
                this.showRoomCompletion();
            }, 1500);
        }
        
        return true;
    }

    /**
     * Handle incorrect selection
     */
    handleIncorrectSelection(scoreLoss = -50, explanation = 'Wrong! This appears to be legitimate.') {
        this.localState.wrongSelections++;
        this.localState.roomScore = Math.max(0, this.localState.roomScore + scoreLoss);
        
        // Update global state (negative score change)
        GameState.updateGlobalCounters(scoreLoss, 0, this.roomName);
        
        // Show feedback
        this.showFeedback(explanation, 'error');
        
        // Update displays
        this.updateLocalDisplay();
        
        return false;
    }

    /**
     * Show feedback message
     */
    showFeedback(message, type) {
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

    /**
     * Update local displays
     */
    updateLocalDisplay() {
        // Update room IoCs display
        const roomIocsElement = document.getElementById('roomIocs');
        if (roomIocsElement) {
            roomIocsElement.textContent = `${this.localState.roomIocsFound}/${this.localState.totalIocs}`;
        }
        
        // Update progress bar if exists
        this.updateProgressBar();
        
        // Update global display with current state
        const currentGlobalState = GameState.loadGameState();
        this.updateGlobalDisplay(currentGlobalState);
    }

    /**
     * Update progress bar
     */
    updateProgressBar() {
        const progressFill = document.getElementById('progressFill');
        if (progressFill) {
            const progress = (this.localState.roomIocsFound / this.localState.totalIocs) * 100;
            progressFill.style.width = `${progress}%`;
        }
    }

    /**
     * Show room completion dialog
     */
    showRoomCompletion() {
        this.cleanup();
        
        const globalStats = GameState.getGameStatistics();
        const roomIcon = this.getRoomIcon();
        const roomTitle = this.getRoomTitle();
        const roomAchievements = this.getRoomAchievements();
        
        const completionMessage = document.createElement('div');
        completionMessage.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            padding: 40px;
            border-radius: 15px;
            border: 2px solid var(--accent, #00ff41);
            text-align: center;
            z-index: 2000;
            box-shadow: 0 0 50px rgba(0, 255, 65, 0.3);
            max-width: 500px;
            width: 90%;
        `;
        
        let completionContent = `
            <h2 style="color: var(--accent, #00ff41); margin-bottom: 20px; font-size: 2rem;">${roomIcon} ${roomTitle} Complete!</h2>
            <p style="color: var(--muted, #88BBDD); margin-bottom: 20px; font-size: 1.2rem;">
                You've identified all IoCs in this investigation area!
            </p>
            <div style="color: var(--accent, #00ff41); font-size: 1.1rem; margin-bottom: 30px;">
                ${roomAchievements}
            </div>
            <div style="margin-bottom: 20px; color: #ffffff;">
                <p style="color: var(--warning, #ffa500);">Room Score: ${this.localState.roomScore} points</p>
                <p style="color: var(--warning, #ffa500);">Global Score: ${globalStats.totalScore} points</p>
                <p style="color: var(--warning, #ffa500);">Global IoCs: ${globalStats.iocsFound}/${globalStats.totalIocs}</p>
            </div>
        `;
        
        // Check if all rooms are completed
        if (globalStats.gameCompleted) {
            completionContent += `
                <div style="background: rgba(0, 255, 0, 0.1); padding: 15px; border-radius: 10px; margin-bottom: 20px;">
                    <h3 style="color: #00ff41; margin-bottom: 10px;">🎉 FULL INVESTIGATION COMPLETE!</h3>
                    <p style="color: #ffffff;">All IoCs found across all rooms!</p>
                </div>
            `;
        }
        
        completionContent += `
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <a href="index.html" style="
                    background: var(--accent, #00ff41); 
                    color: black; 
                    padding: 12px 24px; 
                    text-decoration: none; 
                    border-radius: 25px; 
                    font-weight: bold;
                    display: inline-block;
                ">Continue Investigation</a>
                <button onclick="location.reload()" style="
                    background: var(--cyan, #00ffff); 
                    color: black; 
                    padding: 12px 24px; 
                    border: none; 
                    border-radius: 25px; 
                    cursor: pointer; 
                    font-weight: bold;
                ">Analyze Again</button>
            </div>
        `;
        
        completionMessage.innerHTML = completionContent;
        document.body.appendChild(completionMessage);
    }

    /**
     * Handle game timeout
     */
    endGameDueToTimeout() {
        this.cleanup();
        
        this.showFeedback(`Time's up! You found ${this.localState.roomIocsFound}/${this.localState.totalIocs} IoCs in this room.`, 'error');
        
        setTimeout(() => {
            if (confirm('Time expired! Would you like to return to the main dashboard?')) {
                window.location.href = 'index.html';
            } else {
                location.reload();
            }
        }, 2000);
    }

    /**
     * Add a timer that should be cleaned up when the room is completed or times out
     */
    addTimer(timerId) {
        this.additionalTimers.push(timerId);
    }

    /**
     * Clear additional timers
     */
    clearAdditionalTimers() {
        this.additionalTimers.forEach(timerId => clearInterval(timerId));
        this.additionalTimers = [];
    }

    /**
     * Clean up timers and other resources
     */
    cleanup() {
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
            this.gameTimer = null;
        }
        this.clearAdditionalTimers();
    }

    /**
     * Get room-specific icon (override in room files)
     */
    getRoomIcon() {
        const icons = {
            network: '🌐',
            filesystem: '📁',
            processes: '⚙️',
            authentication: '🔐',
            registry: '📋',
            downloads: '⬇️'
        };
        return icons[this.roomName] || '🔍';
    }

    /**
     * Get room-specific title (override in room files)
     */
    getRoomTitle() {
        const titles = {
            network: 'Network Analysis',
            filesystem: 'Filesystem Analysis',
            processes: 'Process Analysis',
            authentication: 'Authentication Analysis',
            registry: 'Registry Analysis',
            downloads: 'Download Analysis'
        };
        return titles[this.roomName] || 'Investigation';
    }

    /**
     * Get room-specific achievements (override in room files)
     */
    getRoomAchievements() {
        return '<p>✅ Investigation Complete</p>';
    }

    /**
     * Setup page unload cleanup
     */
    setupCleanup() {
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    /**
     * Create a generic click handler for IoC identification
     */
    createClickHandler(dataSelector, iocDataFinder) {
        return (e) => {
            const targetElement = e.target.closest(dataSelector);
            if (!targetElement || GameState.getTimeRemaining() <= 0) return;

            const isIoc = targetElement.dataset.isIoc === 'true';
            const isAlreadySelected = targetElement.classList.contains('selected') || targetElement.classList.contains('wrong');
            
            if (isAlreadySelected) return;

            const itemData = iocDataFinder(targetElement.dataset.id);
            if (!itemData) return;

            if (isIoc) {
                targetElement.classList.add('selected');
                this.handleCorrectIoc(100, `Correct! ${itemData.explanation || 'Well identified!'}`);
            } else {
                targetElement.classList.add('wrong');
                this.handleIncorrectSelection(-50, 'Wrong! This appears to be legitimate.');
            }
        };
    }
}

// Export for use in room files
window.RoomIntegration = RoomIntegration;