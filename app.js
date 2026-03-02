// DeepFocusPomo - Pomodoro + OneTask for ADHD

(function() {
  'use strict';

  // ============== Config ==============
  const CONFIG = {
    WORK_DURATION: 25 * 60,
    SHORT_BREAK: 5 * 60,
    LONG_BREAK: 15 * 60,
    LONG_BREAK_INTERVAL: 4,
    CIRCLE_CIRCUMFERENCE: 565.48
  };

  // ============== State ==============
  const STORAGE_KEY = 'deepfocuspomo_data';

  let state = {
    queue: [],
    completedToday: [],
    lastResetDate: null,
    todayPomodoros: 0,
    sessionCount: 0
  };

  let timer = {
    mode: 'idle',
    remainingSeconds: CONFIG.WORK_DURATION,
    totalSeconds: CONFIG.WORK_DURATION,
    isRunning: false,
    intervalId: null,
    startTime: null
  };

  // ============== DOM Elements ==============
  const elements = {};

  function initElements() {
    elements.timerProgress = document.getElementById('timer-progress');
    elements.timerTime = document.getElementById('timer-time');
    elements.timerMode = document.getElementById('timer-mode');
    elements.timerStartBtn = document.getElementById('timer-start-btn');
    elements.timerPauseBtn = document.getElementById('timer-pause-btn');
    elements.timerResetBtn = document.getElementById('timer-reset-btn');
    elements.totalPomoCount = document.getElementById('total-pomo-count');

    elements.taskTitle = document.getElementById('task-title');
    elements.taskNote = document.getElementById('task-note');
    elements.taskPomoCount = document.getElementById('task-pomo-count');
    elements.doneBtn = document.getElementById('done-btn');
    elements.skipBtn = document.getElementById('skip-btn');
    elements.editBtn = document.getElementById('edit-btn');

    elements.taskList = document.getElementById('task-list');
    elements.taskListCount = document.getElementById('task-list-count');
    elements.addBtn = document.getElementById('add-btn');

    elements.addOverlay = document.getElementById('add-overlay');
    elements.addTitle = document.getElementById('add-title');
    elements.addNote = document.getElementById('add-note');
    elements.addFirst = document.getElementById('add-first');
    elements.addSaveBtn = document.getElementById('add-save-btn');
    elements.addCancelBtn = document.getElementById('add-cancel-btn');

    elements.editOverlay = document.getElementById('edit-overlay');
    elements.editTitle = document.getElementById('edit-title');
    elements.editNote = document.getElementById('edit-note');
    elements.editSaveBtn = document.getElementById('edit-save-btn');
    elements.editCancelBtn = document.getElementById('edit-cancel-btn');

    elements.logOverlay = document.getElementById('log-overlay');
    elements.logList = document.getElementById('log-list');
    elements.logCloseBtn = document.getElementById('log-close-btn');
    elements.completedTodayBtn = document.getElementById('completed-today-btn');
    elements.completedCount = document.getElementById('completed-count');

    elements.positiveMessage = document.getElementById('positive-message');
    elements.pipBtn = document.getElementById('pip-btn');
  }

  // ============== Positive Messages ==============
  const positiveMessages = ["Nice work!", "Keep going!", "One down!", "Great focus!"];

  // ============== Audio ==============
  let audioContext = null;

  function initAudio() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  function playNotificationSound(isBreak = false) {
    initAudio();
    if (audioContext.state === 'suspended') audioContext.resume();

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (isBreak) {
      oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.15);
      oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.3);
    } else {
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.2);
    }

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  }

  // ============== Persistence ==============
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        state = { ...state, ...parsed };
        state.queue = state.queue.map(t => ({ pomodoroCount: 0, ...t }));
      } catch (e) {
        console.error('Failed to parse saved state:', e);
      }
    }
    checkMidnightReset();
  }

  function checkMidnightReset() {
    const today = new Date().toISOString().split('T')[0];
    if (state.lastResetDate !== today) {
      state.completedToday = [];
      state.todayPomodoros = 0;
      state.sessionCount = 0;
      state.lastResetDate = today;
      saveState();
    }
  }

  // ============== ID Generator ==============
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // ============== Timer Functions ==============
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function updateTimerDisplay() {
    if (elements.timerTime) {
      elements.timerTime.textContent = formatTime(timer.remainingSeconds);
    }

    if (elements.timerProgress) {
      const progress = timer.remainingSeconds / timer.totalSeconds;
      const offset = CONFIG.CIRCLE_CIRCUMFERENCE * (1 - progress);
      elements.timerProgress.style.strokeDashoffset = offset;

      elements.timerProgress.classList.remove('break', 'long-break');
      if (timer.mode === 'break') elements.timerProgress.classList.add('break');
      if (timer.mode === 'longBreak') elements.timerProgress.classList.add('long-break');
    }

    if (elements.timerMode) {
      const modeText = { 'idle': 'Focus', 'work': 'Working', 'break': 'Break', 'longBreak': 'Long Break' };
      elements.timerMode.textContent = modeText[timer.mode] || '作業';
      elements.timerMode.classList.remove('break', 'long-break');
      if (timer.mode === 'break') elements.timerMode.classList.add('break');
      if (timer.mode === 'longBreak') elements.timerMode.classList.add('long-break');
    }

    if (elements.totalPomoCount) {
      elements.totalPomoCount.textContent = state.todayPomodoros;
    }

    // Update PiP window if open
    if (window._updatePipDisplay) {
      window._updatePipDisplay();
    }
  }

  function startTimer() {
    if (timer.isRunning) return;
    initAudio();

    if (timer.mode === 'idle') {
      timer.mode = 'work';
      timer.totalSeconds = CONFIG.WORK_DURATION;
      timer.remainingSeconds = CONFIG.WORK_DURATION;
    }

    timer.isRunning = true;
    timer.startTime = Date.now() - ((timer.totalSeconds - timer.remainingSeconds) * 1000);

    if (elements.timerStartBtn) elements.timerStartBtn.classList.add('hidden');
    if (elements.timerPauseBtn) elements.timerPauseBtn.classList.remove('hidden');

    timer.intervalId = setInterval(tickTimer, 1000);
    updateTimerDisplay();
  }

  function pauseTimer() {
    if (!timer.isRunning) return;
    timer.isRunning = false;
    clearInterval(timer.intervalId);
    timer.intervalId = null;

    if (elements.timerStartBtn) {
      elements.timerStartBtn.classList.remove('hidden');
      elements.timerStartBtn.textContent = 'Resume';
    }
    if (elements.timerPauseBtn) elements.timerPauseBtn.classList.add('hidden');
  }

  function resetTimer() {
    timer.isRunning = false;
    clearInterval(timer.intervalId);
    timer.intervalId = null;
    timer.mode = 'idle';
    timer.totalSeconds = CONFIG.WORK_DURATION;
    timer.remainingSeconds = CONFIG.WORK_DURATION;

    if (elements.timerStartBtn) {
      elements.timerStartBtn.classList.remove('hidden');
      elements.timerStartBtn.textContent = 'Start Timer';
    }
    if (elements.timerPauseBtn) elements.timerPauseBtn.classList.add('hidden');
    updateTimerDisplay();
  }

  function tickTimer() {
    const elapsed = Math.floor((Date.now() - timer.startTime) / 1000);
    timer.remainingSeconds = Math.max(0, timer.totalSeconds - elapsed);
    updateTimerDisplay();
    if (timer.remainingSeconds <= 0) onTimerComplete();
  }

  function onTimerComplete() {
    clearInterval(timer.intervalId);
    timer.intervalId = null;
    timer.isRunning = false;

    if (timer.mode === 'work') {
      playNotificationSound(false);
      if (state.queue.length > 0) {
        state.queue[0].pomodoroCount = (state.queue[0].pomodoroCount || 0) + 1;
      }
      state.todayPomodoros++;
      state.sessionCount++;
      saveState();

      if (state.sessionCount >= CONFIG.LONG_BREAK_INTERVAL) {
        timer.mode = 'longBreak';
        timer.totalSeconds = CONFIG.LONG_BREAK;
        timer.remainingSeconds = CONFIG.LONG_BREAK;
        state.sessionCount = 0;
        saveState();
      } else {
        timer.mode = 'break';
        timer.totalSeconds = CONFIG.SHORT_BREAK;
        timer.remainingSeconds = CONFIG.SHORT_BREAK;
      }

      updateTimerDisplay();
      render();
      setTimeout(() => startTimer(), 500);
    } else {
      playNotificationSound(true);
      timer.mode = 'idle';
      timer.totalSeconds = CONFIG.WORK_DURATION;
      timer.remainingSeconds = CONFIG.WORK_DURATION;

      if (elements.timerStartBtn) {
        elements.timerStartBtn.classList.remove('hidden');
        elements.timerStartBtn.textContent = 'Start Timer';
      }
      if (elements.timerPauseBtn) elements.timerPauseBtn.classList.add('hidden');
      updateTimerDisplay();
    }
  }

  // ============== Rendering ==============
  function render() {
    checkMidnightReset();
    updateTimerDisplay();
    renderCurrentTask();
    renderTaskList();
    renderCompletedCount();

    // Update PiP if open
    if (window._updatePipDisplay) {
      window._updatePipDisplay();
    }
  }

  function renderCurrentTask() {
    const task = state.queue[0];

    if (elements.taskTitle) {
      elements.taskTitle.textContent = task ? task.title : 'Add a task to get started';
    }

    if (elements.taskNote) {
      if (task && task.note) {
        elements.taskNote.textContent = task.note;
        elements.taskNote.classList.remove('hidden');
      } else {
        elements.taskNote.classList.add('hidden');
      }
    }

    if (elements.taskPomoCount) {
      if (task && task.pomodoroCount > 0) {
        elements.taskPomoCount.textContent = `🍅 ${task.pomodoroCount}`;
        elements.taskPomoCount.classList.remove('hidden');
      } else {
        elements.taskPomoCount.classList.add('hidden');
      }
    }
  }

  function renderCompletedCount() {
    if (elements.completedCount) {
      elements.completedCount.textContent = state.completedToday.length;
    }
  }

  function renderTaskList() {
    if (!elements.taskList) return;

    elements.taskList.innerHTML = '';

    if (elements.taskListCount) {
      elements.taskListCount.textContent = state.queue.length;
    }

    if (state.queue.length === 0) {
      elements.taskList.innerHTML = '<li class="task-list-empty">No tasks yet</li>';
      return;
    }

    state.queue.forEach((task, index) => {
      const li = document.createElement('li');
      li.className = 'task-list-item' + (index === 0 ? ' current' : '');
      li.dataset.index = index;
      li.dataset.id = task.id;
      li.draggable = true;

      const pomoDisplay = task.pomodoroCount > 0
        ? `<span class="task-list-item-pomo">🍅${task.pomodoroCount}</span>`
        : '';

      li.innerHTML = `
        <span class="task-list-item-indicator"></span>
        <span class="task-list-item-title">${escapeHtml(task.title)}</span>
        ${pomoDisplay}
        <button class="task-list-item-delete" data-id="${task.id}">&times;</button>
      `;
      elements.taskList.appendChild(li);
    });
  }

  function renderLogList() {
    if (!elements.logList) return;
    elements.logList.innerHTML = '';

    if (state.completedToday.length === 0) {
      elements.logList.innerHTML = '<li class="log-item"><span class="log-item-title">No tasks completed yet</span></li>';
      return;
    }

    [...state.completedToday].reverse().forEach(task => {
      const li = document.createElement('li');
      li.className = 'log-item';
      const time = new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const pomoText = task.pomodoroCount > 0 ? `🍅${task.pomodoroCount}` : '';
      li.innerHTML = `
        <span class="log-item-title">${escapeHtml(task.title)}</span>
        <span class="log-item-pomo">${pomoText}</span>
        <span class="log-item-time">${time}</span>
      `;
      elements.logList.appendChild(li);
    });
  }

  // ============== Task Actions ==============
  function addTask(title, note = '', addFirst = false) {
    const task = { id: generateId(), title: title.trim(), note: note.trim(), pomodoroCount: 0 };
    if (addFirst) {
      state.queue.unshift(task);
    } else {
      state.queue.push(task);
    }
    saveState();
    render();
  }

  function completeCurrentTask() {
    if (state.queue.length === 0) return;
    const task = state.queue.shift();
    state.completedToday.push({
      id: task.id,
      title: task.title,
      completedAt: new Date().toISOString(),
      pomodoroCount: task.pomodoroCount || 0
    });
    saveState();
    showPositiveMessage();
    render();
    resetTimer();
  }

  function skipCurrentTask() {
    if (state.queue.length <= 1) return;
    const task = state.queue.shift();
    state.queue.push(task);
    saveState();
    render();
    resetTimer();
  }

  function deleteTask(id) {
    const wasFirst = state.queue.length > 0 && state.queue[0].id === id;
    state.queue = state.queue.filter(t => t.id !== id);
    saveState();
    render();
    if (wasFirst) resetTimer();
  }

  function editCurrentTask(title, note) {
    if (state.queue.length === 0) return;
    state.queue[0].title = title.trim();
    state.queue[0].note = note.trim();
    saveState();
    render();
  }

  function makeTaskCurrent(index) {
    if (index <= 0 || index >= state.queue.length) return;
    const task = state.queue.splice(index, 1)[0];
    state.queue.unshift(task);
    saveState();
    render();
    resetTimer();
  }

  // ============== Animations ==============
  function showPositiveMessage() {
    if (!elements.positiveMessage) return;
    const msg = positiveMessages[Math.floor(Math.random() * positiveMessages.length)];
    elements.positiveMessage.textContent = msg;
    elements.positiveMessage.classList.remove('hidden');
    setTimeout(() => elements.positiveMessage.classList.add('hidden'), 500);
  }

  // ============== Overlays ==============
  function openAddOverlay() {
    if (!elements.addOverlay) return;
    elements.addOverlay.classList.remove('hidden');
    if (elements.addTitle) { elements.addTitle.value = ''; elements.addTitle.focus(); }
    if (elements.addNote) elements.addNote.value = '';
    if (elements.addFirst) elements.addFirst.checked = false;
  }

  function closeAddOverlay() {
    if (elements.addOverlay) elements.addOverlay.classList.add('hidden');
  }

  function openEditOverlay() {
    if (!elements.editOverlay || state.queue.length === 0) return;
    const task = state.queue[0];
    elements.editOverlay.classList.remove('hidden');
    if (elements.editTitle) { elements.editTitle.value = task.title; elements.editTitle.focus(); }
    if (elements.editNote) elements.editNote.value = task.note || '';
  }

  function closeEditOverlay() {
    if (elements.editOverlay) elements.editOverlay.classList.add('hidden');
  }

  function openLogOverlay() {
    if (!elements.logOverlay) return;
    renderLogList();
    elements.logOverlay.classList.remove('hidden');
  }

  function closeLogOverlay() {
    if (elements.logOverlay) elements.logOverlay.classList.add('hidden');
  }

  function closeAllOverlays() {
    closeAddOverlay();
    closeEditOverlay();
    closeLogOverlay();
  }

  // ============== Drag and Drop ==============
  let draggedItem = null;
  let pipWindow = null;

  // ============== Picture-in-Picture ==============
  async function openPictureInPicture() {
    if (!('documentPictureInPicture' in window)) {
      alert('Picture-in-Picture is not supported in this browser. Try Chrome 116+.');
      return;
    }

    try {
      pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 320,
        height: 200
      });

      const pipDoc = pipWindow.document;
      pipDoc.head.innerHTML = `
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #1a1a2e;
            color: #fff;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            padding: 16px;
            user-select: none;
          }
          .pip-timer {
            font-size: 3.5rem;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
            line-height: 1;
          }
          .pip-mode {
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-top: 8px;
            color: #4ade80;
          }
          .pip-mode.break { color: #60a5fa; }
          .pip-mode.long-break { color: #a78bfa; }
          .pip-task {
            font-size: 0.9rem;
            color: #aaa;
            margin-top: 12px;
            text-align: center;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .pip-controls {
            display: flex;
            gap: 8px;
            margin-top: 12px;
          }
          .pip-btn {
            padding: 6px 14px;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
          }
          .pip-btn-start { background: #4ade80; color: #000; }
          .pip-btn-pause { background: #f59e0b; color: #000; }
          .pip-btn-reset { background: #374151; color: #fff; }
        </style>
      `;

      pipDoc.body.innerHTML = `
        <div class="pip-timer" id="pip-time">25:00</div>
        <div class="pip-mode" id="pip-mode">Focus</div>
        <div class="pip-task" id="pip-task">No task</div>
        <div class="pip-controls">
          <button class="pip-btn pip-btn-start" id="pip-start">Start</button>
          <button class="pip-btn pip-btn-reset" id="pip-reset">Reset</button>
        </div>
      `;

      // Get PiP elements
      const pipTime = pipDoc.getElementById('pip-time');
      const pipMode = pipDoc.getElementById('pip-mode');
      const pipTask = pipDoc.getElementById('pip-task');
      const pipStart = pipDoc.getElementById('pip-start');
      const pipReset = pipDoc.getElementById('pip-reset');

      // Update PiP display
      function updatePipDisplay() {
        if (!pipWindow || pipWindow.closed) return;

        pipTime.textContent = formatTime(timer.remainingSeconds);

        const modeText = { 'idle': 'Focus', 'work': 'Working', 'break': 'Break', 'longBreak': 'Long Break' };
        pipMode.textContent = modeText[timer.mode] || 'Focus';
        pipMode.className = 'pip-mode';
        if (timer.mode === 'break') pipMode.classList.add('break');
        if (timer.mode === 'longBreak') pipMode.classList.add('long-break');

        const task = state.queue[0];
        pipTask.textContent = task ? task.title : 'No task';

        if (timer.isRunning) {
          pipStart.textContent = 'Pause';
          pipStart.className = 'pip-btn pip-btn-pause';
        } else {
          pipStart.textContent = timer.mode === 'idle' ? 'Start' : 'Resume';
          pipStart.className = 'pip-btn pip-btn-start';
        }
      }

      // Event listeners for PiP
      pipStart.addEventListener('click', () => {
        if (timer.isRunning) {
          pauseTimer();
        } else {
          startTimer();
        }
        updatePipDisplay();
      });

      pipReset.addEventListener('click', () => {
        resetTimer();
        updatePipDisplay();
      });

      // Initial update
      updatePipDisplay();

      // Store update function globally for timer updates
      window._updatePipDisplay = updatePipDisplay;

      // Clean up on close
      pipWindow.addEventListener('pagehide', () => {
        pipWindow = null;
        window._updatePipDisplay = null;
      });

    } catch (error) {
      console.error('PiP error:', error);
    }
  }

  function handleDragStart(e) {
    draggedItem = e.target.closest('.task-list-item');
    if (draggedItem) draggedItem.classList.add('dragging');
  }

  function handleDragOver(e) {
    e.preventDefault();
    const target = e.target.closest('.task-list-item');
    if (!target || target === draggedItem) return;
    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
      target.parentNode.insertBefore(draggedItem, target);
    } else {
      target.parentNode.insertBefore(draggedItem, target.nextSibling);
    }
  }

  function handleDragEnd() {
    if (!draggedItem) return;
    draggedItem.classList.remove('dragging');

    const items = elements.taskList.querySelectorAll('.task-list-item');
    const newQueue = [];
    items.forEach(item => {
      const task = state.queue.find(t => t.id === item.dataset.id);
      if (task) newQueue.push(task);
    });

    const firstChanged = newQueue.length > 0 && state.queue.length > 0 && newQueue[0].id !== state.queue[0].id;
    state.queue = newQueue;
    saveState();
    render();
    if (firstChanged) resetTimer();
    draggedItem = null;
  }

  // ============== Keyboard Shortcuts ==============
  function handleKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      if (e.key === 'Escape') closeAllOverlays();
      return;
    }

    if (e.key === 'Escape') { closeAllOverlays(); return; }

    const overlayOpen = !elements.addOverlay?.classList.contains('hidden') ||
                        !elements.editOverlay?.classList.contains('hidden') ||
                        !elements.logOverlay?.classList.contains('hidden');
    if (overlayOpen) return;

    switch (e.key.toLowerCase()) {
      case 'd': case 'enter': e.preventDefault(); completeCurrentTask(); break;
      case 's': e.preventDefault(); skipCurrentTask(); break;
      case 'n': case '/': e.preventDefault(); openAddOverlay(); break;
      case 'e': e.preventDefault(); openEditOverlay(); break;
      case ' ': e.preventDefault(); timer.isRunning ? pauseTimer() : startTimer(); break;
      case 'r': e.preventDefault(); resetTimer(); break;
    }
  }

  // ============== Event Listeners ==============
  function initEventListeners() {
    // Timer
    if (elements.timerStartBtn) elements.timerStartBtn.addEventListener('click', startTimer);
    if (elements.timerPauseBtn) elements.timerPauseBtn.addEventListener('click', pauseTimer);
    if (elements.timerResetBtn) elements.timerResetBtn.addEventListener('click', resetTimer);
    if (elements.pipBtn) elements.pipBtn.addEventListener('click', openPictureInPicture);

    // Task actions
    if (elements.doneBtn) elements.doneBtn.addEventListener('click', completeCurrentTask);
    if (elements.skipBtn) elements.skipBtn.addEventListener('click', skipCurrentTask);
    if (elements.editBtn) elements.editBtn.addEventListener('click', openEditOverlay);
    if (elements.addBtn) elements.addBtn.addEventListener('click', openAddOverlay);

    // Add overlay
    if (elements.addCancelBtn) elements.addCancelBtn.addEventListener('click', closeAddOverlay);
    if (elements.addSaveBtn) {
      elements.addSaveBtn.addEventListener('click', () => {
        const title = elements.addTitle?.value.trim();
        if (!title) return;
        addTask(title, elements.addNote?.value || '', elements.addFirst?.checked || false);
        closeAddOverlay();
      });
    }
    if (elements.addTitle) {
      elements.addTitle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const title = elements.addTitle.value.trim();
          if (!title) return;
          addTask(title, elements.addNote?.value || '', elements.addFirst?.checked || false);
          closeAddOverlay();
        }
      });
    }
    if (elements.addOverlay) {
      elements.addOverlay.addEventListener('click', (e) => {
        if (e.target === elements.addOverlay) closeAddOverlay();
      });
    }

    // Edit overlay
    if (elements.editCancelBtn) elements.editCancelBtn.addEventListener('click', closeEditOverlay);
    if (elements.editSaveBtn) {
      elements.editSaveBtn.addEventListener('click', () => {
        const title = elements.editTitle?.value.trim();
        if (!title) return;
        editCurrentTask(title, elements.editNote?.value || '');
        closeEditOverlay();
      });
    }
    if (elements.editTitle) {
      elements.editTitle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const title = elements.editTitle.value.trim();
          if (!title) return;
          editCurrentTask(title, elements.editNote?.value || '');
          closeEditOverlay();
        }
      });
    }
    if (elements.editOverlay) {
      elements.editOverlay.addEventListener('click', (e) => {
        if (e.target === elements.editOverlay) closeEditOverlay();
      });
    }

    // Task list
    if (elements.taskList) {
      elements.taskList.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.task-list-item-delete');
        if (deleteBtn) { deleteTask(deleteBtn.dataset.id); return; }
        const item = e.target.closest('.task-list-item');
        if (item) makeTaskCurrent(parseInt(item.dataset.index));
      });
      elements.taskList.addEventListener('dragstart', handleDragStart);
      elements.taskList.addEventListener('dragover', handleDragOver);
      elements.taskList.addEventListener('dragend', handleDragEnd);
    }

    // Log
    if (elements.completedTodayBtn) elements.completedTodayBtn.addEventListener('click', openLogOverlay);
    if (elements.logCloseBtn) elements.logCloseBtn.addEventListener('click', closeLogOverlay);
    if (elements.logOverlay) {
      elements.logOverlay.addEventListener('click', (e) => {
        if (e.target === elements.logOverlay) closeLogOverlay();
      });
    }

    // Keyboard
    document.addEventListener('keydown', handleKeyDown);
  }

  // ============== Utils ==============
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ============== Init ==============
  function init() {
    initElements();
    loadState();
    initEventListeners();
    render();
    console.log('DeepFocusPomo initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
