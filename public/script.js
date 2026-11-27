const state = {
    notes: [],
    activeFilter: 'All',
    sortOrder: 'newest',
    viewMode: 'grid',
    searchQuery: '',
    composerColor: 'default',
    composerPinned: false,
    editingNoteId: null,
    modalMode: 'read',
    editColor: 'default',
    editPinned: false,
    isRecording: false,
    slashMatches: [],
    slashActiveIndex: 0,
    slashStartOffset: null
};

const SLASH_COMMANDS = [
    {
        command: '/todo',
        description: 'Checklist item',
        icon: 'check-square',
        getText: () => '- [ ] '
    },
    {
        command: '/code',
        description: 'Inline code snippet',
        icon: 'code-2',
        getText: () => '`code`',
        selectRange: [1, 5]
    },
    {
        command: '/date',
        description: "Today's date",
        icon: 'calendar',
        getText: () => formatTodayDate()
    },
    {
        command: '/divider',
        description: 'Section divider',
        icon: 'minus',
        getText: () => '──────────'
    }
];

const TEMPLATES = {
    study: {
        title: 'Study Summary',
        tag: 'Study',
        content: [
            'Topic: ',
            'Key Takeaways:',
            '- ',
            '- ',
            '',
            'Next Review:',
            '- [ ] Review core concepts',
            '- [ ] Practice problems'
        ].join('\n')
    },
    code: {
        title: 'Code Snippet',
        tag: 'Work',
        content: [
            'Purpose: ',
            'Command: `command here`',
            '',
            'Notes:',
            '- '
        ].join('\n')
    },
    checklist: {
        title: 'Daily Checklist',
        tag: 'Personal',
        content: [
            '- [ ] Top priority task',
            '- [ ] Follow-up item',
            '- [ ] Quick wrap-up'
        ].join('\n')
    }
};

let toastTimer = null;
let recognition = null;
let dictationBaseText = '';
let dictationFinalText = '';

function applySavedTheme() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    document.body.classList.toggle('dark', isDark);
    updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
    const themeBtn = document.getElementById('themeToggleBtn');
    if (!themeBtn) return;
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    themeBtn.replaceChildren(icon);
    refreshIcons();
}

function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem('darkMode', String(isDark));
    updateThemeIcon(isDark);
}

function applySavedViewMode() {
    const saved = localStorage.getItem('notesViewMode') === 'list' ? 'list' : 'grid';
    setViewMode(saved, false);
}

function setViewMode(mode, persist = true) {
    state.viewMode = mode === 'list' ? 'list' : 'grid';
    if (persist) {
        localStorage.setItem('notesViewMode', state.viewMode);
    }

    const container = document.getElementById('notesContainer');
    const gridBtn = document.getElementById('gridViewBtn');
    const listBtn = document.getElementById('listViewBtn');

    if (container) {
        container.classList.toggle('list-view', state.viewMode === 'list');
    }
    if (gridBtn) {
        const isGrid = state.viewMode === 'grid';
        gridBtn.classList.toggle('active', isGrid);
        gridBtn.setAttribute('aria-pressed', String(isGrid));
    }
    if (listBtn) {
        const isList = state.viewMode === 'list';
        listBtn.classList.toggle('active', isList);
        listBtn.setAttribute('aria-pressed', String(isList));
    }
}

function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

function autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 320)}px`;
}

function updateComposerCounter() {
    const content = document.getElementById('noteInput').value;
    const charCount = content.length;
    const trimmed = content.trim();
    const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
    document.getElementById('count').textContent =
        `${charCount} ${charCount === 1 ? 'char' : 'chars'} · ${wordCount} ${wordCount === 1 ? 'word' : 'words'}`;
}

function setColorPickerSelection(containerId, cardId, color) {
    const container = document.getElementById(containerId);
    const card = document.getElementById(cardId);
    if (card) {
        card.setAttribute('data-color', color);
    }
    if (!container) return;
    container.querySelectorAll('.color-swatch').forEach((swatch) => {
        swatch.classList.toggle('active', swatch.dataset.color === color);
    });
}

function setPinButtonState(buttonId, pinned) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.classList.toggle('active', pinned);
    btn.setAttribute('aria-pressed', String(pinned));
}

function showToast(message, options = {}) {
    const { actionLabel = null, onAction = null, duration = 2500 } = options;
    const toast = document.getElementById('toast');

    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    toast.replaceChildren(msgSpan);

    if (actionLabel && typeof onAction === 'function') {
        const actionBtn = document.createElement('button');
        actionBtn.type = 'button';
        actionBtn.className = 'toast-action-btn';
        actionBtn.textContent = actionLabel;
        actionBtn.addEventListener('click', () => {
            toast.classList.remove('show');
            if (toastTimer) clearTimeout(toastTimer);
            onAction();
        });
        toast.appendChild(actionBtn);
    }

    toast.classList.add('show');

    if (toastTimer) {
        clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// VOICE-TO-NOTE DICTATION

function setRecordingState(recording) {
    state.isRecording = recording;
    const micBtn = document.getElementById('voiceDictationBtn');
    if (!micBtn) return;
    micBtn.classList.toggle('recording', recording);
    micBtn.setAttribute('aria-pressed', String(recording));
    micBtn.title = recording ? 'Stop dictation' : 'Voice dictation';
}

function toggleVoiceDictation() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast('Voice dictation is not supported in this browser');
        return;
    }

    if (state.isRecording && recognition) {
        recognition.stop();
        return;
    }

    const noteInput = document.getElementById('noteInput');
    dictationBaseText = noteInput.value;
    if (dictationBaseText.length > 0 && !/\s$/.test(dictationBaseText)) {
        dictationBaseText += ' ';
    }
    dictationFinalText = '';

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    recognition.onstart = () => {
        setRecordingState(true);
        showToast('Listening... speak your note');
    };

    recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                dictationFinalText += transcript;
            } else {
                interim += transcript;
            }
        }
        noteInput.value = `${dictationBaseText}${dictationFinalText}${interim}`;
        autoResizeTextarea(noteInput);
        updateComposerCounter();
    };

    recognition.onerror = (event) => {
        if (event.error !== 'aborted') {
            showToast(`Dictation error: ${event.error}`);
        }
        setRecordingState(false);
    };

    recognition.onend = () => {
        setRecordingState(false);
    };

    try {
        recognition.start();
    } catch (error) {
        setRecordingState(false);
        showToast('Could not start voice dictation');
    }
}

// QUICK TEMPLATES & MARKDOWN EXPORT

function closeTemplateMenu() {
    const menu = document.getElementById('templateMenu');
    const toggleBtn = document.getElementById('templateToggleBtn');
    if (menu) menu.classList.add('hidden');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
}

function resetComposer() {
    const titleInput = document.getElementById('noteTitleInput');
    const noteInput = document.getElementById('noteInput');
    const tagSelect = document.getElementById('noteTagSelect');

    if (state.isRecording && recognition) {
        recognition.stop();
    }

    titleInput.value = '';
    noteInput.value = '';
    noteInput.style.height = 'auto';
    tagSelect.value = 'General';
    state.composerColor = 'default';
    state.composerPinned = false;
    setColorPickerSelection('composerColors', 'composerCard', 'default');
    setPinButtonState('composerPinBtn', false);
    updateComposerCounter();
    closeSlashMenu();
}

function applyTemplate(templateKey) {
    if (templateKey === 'clear') {
        resetComposer();
        closeTemplateMenu();
        document.getElementById('noteInput').focus();
        return;
    }

    const tpl = TEMPLATES[templateKey];
    if (!tpl) return;

    const titleInput = document.getElementById('noteTitleInput');
    const noteInput = document.getElementById('noteInput');
    const tagSelect = document.getElementById('noteTagSelect');

    if (state.isRecording && recognition) {
        recognition.stop();
    }

    titleInput.value = tpl.title;
    noteInput.value = tpl.content;
    tagSelect.value = tpl.tag;

    autoResizeTextarea(noteInput);
    updateComposerCounter();
    closeTemplateMenu();
    closeSlashMenu();
    noteInput.focus();
}

function formatTodayDate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}-${month}-${year}`;
}

function closeExportMenu() {
    const menu = document.getElementById('exportMenu');
    const btn = document.getElementById('exportToggleBtn');
    if (menu) menu.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function triggerDownload(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function exportNotesAsMarkdown() {
    closeExportMenu();
    if (state.notes.length === 0) {
        showToast('No notes to export');
        return;
    }

    const lines = [
        '# Scribbly Notes',
        `Exported on ${new Date().toLocaleString()}`,
        ''
    ];

    state.notes.forEach((note) => {
        const heading = note.title && note.title.trim() ? note.title.trim() : 'Untitled Note';
        const pinLabel = note.pinned ? ' | Pinned' : '';
        lines.push(`## ${heading}`);
        lines.push(`*Tag: ${note.tag || 'General'} | Created: ${note.created_at}${pinLabel}*`);
        lines.push('');
        lines.push(note.content || '');
        lines.push('');
        lines.push('---');
        lines.push('');
    });

    const dateStamp = new Date().toISOString().slice(0, 10);
    triggerDownload(`scribbly-notes-${dateStamp}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
    showToast('Exported notes as Markdown');
}

function exportNotesAsJson() {
    closeExportMenu();
    if (state.notes.length === 0) {
        showToast('No notes to export');
        return;
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    triggerDownload(
        `scribbly-backup-${dateStamp}.json`,
        JSON.stringify(state.notes, null, 2),
        'application/json;charset=utf-8'
    );
    showToast('Exported JSON backup');
}

async function importNotesFromFile(file) {
    if (!file) return;

    try {
        const raw = await file.text();
        const parsed = JSON.parse(raw);
        const candidates = Array.isArray(parsed)
            ? parsed
            : (parsed && Array.isArray(parsed.notes) ? parsed.notes : null);

        if (!candidates) {
            showToast('Invalid backup JSON format');
            return;
        }

        const validNotes = candidates.filter(
            (item) => item && typeof item.content === 'string' && item.content.trim().length > 0
        );

        if (validNotes.length === 0) {
            showToast('No valid notes found in backup');
            return;
        }

        let importedCount = 0;
        for (let i = validNotes.length - 1; i >= 0; i -= 1) {
            const item = validNotes[i];
            const response = await fetch('/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: typeof item.title === 'string' ? item.title : '',
                    content: item.content,
                    tag: typeof item.tag === 'string' && item.tag.trim() ? item.tag : 'General',
                    color: typeof item.color === 'string' ? item.color : 'default',
                    pinned: Boolean(item.pinned)
                })
            });
            if (response.ok) {
                importedCount += 1;
            }
        }

        await loadNotes();
        if (importedCount > 0) {
            showToast(`Imported ${importedCount} ${importedCount === 1 ? 'note' : 'notes'}`);
        } else {
            showToast('Failed to import notes');
        }
    } catch (error) {
        showToast('Could not parse JSON backup file');
    }
}

// INLINE SLASH COMMANDS

function closeSlashMenu() {
    const menu = document.getElementById('slashMenu');
    if (menu) {
        menu.classList.add('hidden');
        menu.replaceChildren();
    }
    state.slashMatches = [];
    state.slashActiveIndex = 0;
    state.slashStartOffset = null;
}

function renderSlashMenu() {
    const menu = document.getElementById('slashMenu');
    if (!menu) return;

    if (state.slashMatches.length === 0) {
        closeSlashMenu();
        return;
    }

    const fragment = document.createDocumentFragment();
    state.slashMatches.forEach((cmd, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = idx === state.slashActiveIndex ? 'slash-item active' : 'slash-item';
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', String(idx === state.slashActiveIndex));

        const left = document.createElement('span');
        left.className = 'slash-item-left';
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', cmd.icon);
        const name = document.createElement('span');
        name.textContent = cmd.command;
        left.append(icon, name);

        const desc = document.createElement('span');
        desc.className = 'slash-item-desc';
        desc.textContent = cmd.description;

        btn.append(left, desc);
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            applySlashCommand(cmd);
        });

        fragment.appendChild(btn);
    });

    menu.replaceChildren(fragment);
    menu.classList.remove('hidden');
    refreshIcons();
}

function updateSlashMenuFromInput(noteInput) {
    const cursor = noteInput.selectionStart;
    if (cursor !== noteInput.selectionEnd) {
        closeSlashMenu();
        return;
    }

    const lineStart = noteInput.value.lastIndexOf('\n', cursor - 1) + 1;
    const lineBeforeCursor = noteInput.value.slice(lineStart, cursor);
    const match = lineBeforeCursor.match(/^\/([a-z]*)$/i);

    if (!match) {
        closeSlashMenu();
        return;
    }

    const query = `/${match[1].toLowerCase()}`;
    const matches = SLASH_COMMANDS.filter((cmd) => cmd.command.startsWith(query));
    if (matches.length === 0) {
        closeSlashMenu();
        return;
    }

    state.slashMatches = matches;
    state.slashActiveIndex = 0;
    state.slashStartOffset = lineStart;
    renderSlashMenu();
}

function applySlashCommand(cmd) {
    if (!cmd || state.slashStartOffset === null) return;
    const noteInput = document.getElementById('noteInput');
    const cursor = noteInput.selectionStart;
    const inserted = cmd.getText();

    const before = noteInput.value.slice(0, state.slashStartOffset);
    const after = noteInput.value.slice(cursor);
    noteInput.value = `${before}${inserted}${after}`;

    const startPos = before.length + (cmd.selectRange ? cmd.selectRange[0] : inserted.length);
    const endPos = before.length + (cmd.selectRange ? cmd.selectRange[1] : inserted.length);

    closeSlashMenu();
    noteInput.focus();
    noteInput.setSelectionRange(startPos, endPos);
    autoResizeTextarea(noteInput);
    updateComposerCounter();
}

// API OPERATIONS

async function loadNotes() {
    try {
        const response = await fetch('/notes');
        if (!response.ok) {
            showToast('Failed to load notes');
            return;
        }
        state.notes = await response.json();
        renderNotes();
    } catch (error) {
        showToast('Failed to load notes');
    }
}

async function saveNote() {
    const titleInput = document.getElementById('noteTitleInput');
    const contentInput = document.getElementById('noteInput');
    const tagSelect = document.getElementById('noteTagSelect');

    if (state.isRecording && recognition) {
        recognition.stop();
    }

    const title = titleInput.value.trim();
    const content = contentInput.value;

    if (content.trim() === '') {
        showToast('Write something first!');
        contentInput.focus();
        return;
    }

    try {
        const response = await fetch('/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                content,
                tag: tagSelect.value,
                color: state.composerColor,
                pinned: state.composerPinned
            })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showToast(data.error || 'Failed to save note');
            return;
        }

        resetComposer();

        await loadNotes();
        showToast('Note Saved Successfully');
    } catch (error) {
        showToast('Failed to save note');
    }
}

async function updateNoteById(id, payload, successMessage = null) {
    try {
        const response = await fetch(`/notes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showToast(data.error || 'Failed to update note');
            return false;
        }

        await loadNotes();
        if (successMessage) {
            showToast(successMessage);
        }
        return true;
    } catch (error) {
        showToast('Failed to update note');
        return false;
    }
}

async function restoreDeletedNote(noteSnapshot) {
    try {
        const response = await fetch('/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: noteSnapshot.title || '',
                content: noteSnapshot.content,
                tag: noteSnapshot.tag || 'General',
                color: noteSnapshot.color || 'default',
                pinned: Boolean(noteSnapshot.pinned)
            })
        });

        if (!response.ok) {
            showToast('Failed to restore note');
            return;
        }

        await loadNotes();
        showToast('Note restored');
    } catch (error) {
        showToast('Failed to restore note');
    }
}

async function deleteNote(id) {
    const noteSnapshot = state.notes.find((n) => n.id === id);

    try {
        const response = await fetch(`/notes/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            showToast(data.error || 'Failed to delete note');
            return;
        }

        await loadNotes();

        if (noteSnapshot) {
            showToast('Note deleted', {
                actionLabel: 'Undo',
                duration: 5000,
                onAction: () => restoreDeletedNote(noteSnapshot)
            });
        } else {
            showToast('Note deleted');
        }
    } catch (error) {
        showToast('Failed to delete note');
    }
}

async function copyNote(note) {
    const textToCopy = note.title ? `${note.title}\n\n${note.content}` : note.content;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(textToCopy);
        } else {
            const temp = document.createElement('textarea');
            temp.value = textToCopy;
            temp.style.position = 'fixed';
            temp.style.opacity = '0';
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            document.body.removeChild(temp);
        }
        showToast('Copied to clipboard');
    } catch (error) {
        showToast('Unable to copy note');
    }
}

// SAFE CHECKLIST & INLINE CODE RENDERING

function appendInlineFormattedText(container, text) {
    const parts = text.split(/(`[^`]+`)/g);
    parts.forEach((part) => {
        if (!part) return;
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
            const codeEl = document.createElement('code');
            codeEl.className = 'inline-code';
            codeEl.textContent = part.slice(1, -1);
            container.appendChild(codeEl);
        } else {
            container.appendChild(document.createTextNode(part));
        }
    });
}

const CHECKLIST_LINE_RE = /^(\s*(?:-\s+)?)\[([ xX])\] (.*)$/;

function parseChecklistLine(line) {
    if (typeof line !== 'string') return null;
    const match = line.match(CHECKLIST_LINE_RE);
    if (!match) return null;
    return {
        prefix: match[1],
        checked: match[2].toLowerCase() === 'x',
        text: match[3]
    };
}

async function toggleChecklistLine(note, lineIndex, isChecked) {
    const lines = (note.content || '').split('\n');
    const parsed = parseChecklistLine(lines[lineIndex]);
    if (!parsed) return;

    lines[lineIndex] = `${parsed.prefix}[${isChecked ? 'x' : ' '}] ${parsed.text}`;
    const updatedContent = lines.join('\n');

    await updateNoteById(note.id, { content: updatedContent });
}

function renderFormattedBody(note) {
    const bodyEl = document.createElement('div');
    bodyEl.className = 'note-content';

    const lines = (note.content || '').split('\n');
    lines.forEach((line, index) => {
        const parsed = parseChecklistLine(line);
        if (parsed) {
            const itemDiv = document.createElement('div');
            itemDiv.className = parsed.checked ? 'checklist-item completed' : 'checklist-item';

            const label = document.createElement('label');
            label.className = 'checklist-label';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'checklist-checkbox';
            checkbox.checked = parsed.checked;

            checkbox.addEventListener('click', (e) => e.stopPropagation());
            checkbox.addEventListener('change', async () => {
                itemDiv.classList.toggle('completed', checkbox.checked);
                await toggleChecklistLine(note, index, checkbox.checked);
            });

            const textSpan = document.createElement('span');
            textSpan.className = 'checklist-text';
            appendInlineFormattedText(textSpan, parsed.text);

            label.append(checkbox, textSpan);
            itemDiv.appendChild(label);
            bodyEl.appendChild(itemDiv);
        } else {
            const lineEl = document.createElement('p');
            lineEl.className = 'note-line';
            if (line === '') {
                lineEl.appendChild(document.createElement('br'));
            } else {
                appendInlineFormattedText(lineEl, line);
            }
            bodyEl.appendChild(lineEl);
        }
    });

    return bodyEl;
}

// FILTERING, SORTING & RENDERING

function getFilteredAndSortedNotes() {
    const query = state.searchQuery.trim().toLowerCase();

    const filtered = state.notes.filter((note) => {
        if (state.activeFilter === 'Pinned' && !note.pinned) {
            return false;
        }
        if (
            state.activeFilter !== 'All' &&
            state.activeFilter !== 'Pinned' &&
            note.tag !== state.activeFilter
        ) {
            return false;
        }

        if (!query) return true;

        const title = (note.title || '').toLowerCase();
        const content = (note.content || '').toLowerCase();
        const tag = (note.tag || '').toLowerCase();
        return title.includes(query) || content.includes(query) || tag.includes(query);
    });

    return filtered.sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) {
            return a.pinned ? -1 : 1;
        }
        return state.sortOrder === 'newest' ? b.id - a.id : a.id - b.id;
    });
}

function createActionButton(iconName, label, extraClasses, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `icon-btn note-action-btn ${extraClasses}`.trim();
    btn.setAttribute('aria-label', label);
    btn.title = label;

    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', iconName);
    btn.appendChild(icon);

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
    });

    return btn;
}

function createNoteCard(note) {
    const card = document.createElement('article');
    card.className = 'note-card note';
    card.setAttribute('data-color', note.color || 'default');

    // Top Wrapper: Header + Title + Content
    const noteBody = document.createElement('div');
    noteBody.className = 'note-body';

    // Header: Tag + Pinned indicator
    const header = document.createElement('div');
    header.className = 'note-card-header';

    const badges = document.createElement('div');
    badges.className = 'note-badges';

    const tagPill = document.createElement('span');
    tagPill.className = 'tag-pill';
    tagPill.textContent = note.tag || 'General';
    badges.appendChild(tagPill);

    if (note.pinned) {
        const pinnedPill = document.createElement('span');
        pinnedPill.className = 'pinned-pill';
        const pinIcon = document.createElement('i');
        pinIcon.setAttribute('data-lucide', 'pin');
        const pinText = document.createElement('span');
        pinText.textContent = 'Pinned';
        pinnedPill.append(pinIcon, pinText);
        badges.appendChild(pinnedPill);
    }

    header.appendChild(badges);
    noteBody.appendChild(header);

    const textGroup = document.createElement('div');
    textGroup.className = 'note-text-group';

    // Optional Title (clickable to open Focus View)
    if (note.title && note.title.trim()) {
        const titleEl = document.createElement('h3');
        titleEl.className = 'note-title';
        titleEl.textContent = note.title;
        titleEl.title = 'Open focus view';
        titleEl.addEventListener('click', (e) => {
            e.stopPropagation();
            openFocusModal(note, 'read');
        });
        textGroup.appendChild(titleEl);
    }

    // Formatted Body Content (Checklists + Inline Code)
    textGroup.appendChild(renderFormattedBody(note));
    noteBody.appendChild(textGroup);
    card.appendChild(noteBody);

    // Footer: Timestamp + Icon Actions
    const footer = document.createElement('div');
    footer.className = 'note-footer';

    const timeEl = document.createElement('time');
    timeEl.className = 'note-time';
    timeEl.textContent = note.created_at;

    const actions = document.createElement('div');
    actions.className = 'note-actions';

    const expandBtn = createActionButton(
        'maximize-2',
        'Focus view',
        '',
        () => openFocusModal(note, 'read')
    );

    const pinBtn = createActionButton(
        'pin',
        note.pinned ? 'Unpin note' : 'Pin note',
        note.pinned ? 'is-pinned' : '',
        () => updateNoteById(note.id, { pinned: !note.pinned }, note.pinned ? 'Note unpinned' : 'Note pinned')
    );

    const copyBtn = createActionButton(
        'copy',
        'Copy to clipboard',
        '',
        () => copyNote(note)
    );

    const editBtn = createActionButton(
        'pencil',
        'Edit note',
        '',
        () => openFocusModal(note, 'edit')
    );

    const deleteBtn = createActionButton(
        'trash-2',
        'Delete note',
        'delete-action',
        () => deleteNote(note.id)
    );

    actions.append(expandBtn, pinBtn, copyBtn, editBtn, deleteBtn);
    footer.append(timeEl, actions);
    card.appendChild(footer);

    return card;
}

function updateNoteCountBadge() {
    const total = state.notes.length;
    const badge = document.getElementById('noteCountBadge');
    badge.textContent = `${total} ${total === 1 ? 'note' : 'notes'}`;
}

function renderNotes() {
    updateNoteCountBadge();

    const container = document.getElementById('notesContainer');
    const emptyState = document.getElementById('emptyState');
    const emptyTitle = document.getElementById('emptyTitle');
    const emptyMessage = document.getElementById('emptyMessage');
    const resetFiltersBtn = document.getElementById('resetFiltersBtn');

    const visibleNotes = getFilteredAndSortedNotes();
    container.innerHTML = '';

    if (visibleNotes.length === 0) {
        const hasFilters = state.activeFilter !== 'All' || state.searchQuery.trim() !== '';
        emptyTitle.textContent = hasFilters ? 'No matching notes' : 'No notes yet';
        emptyMessage.textContent = hasFilters
            ? 'Try adjusting your search query or switching category filters.'
            : 'Capture your first thought using the composer on the left.';
        resetFiltersBtn.classList.toggle('hidden', !hasFilters);
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
        const fragment = document.createDocumentFragment();
        visibleNotes.forEach((note) => {
            fragment.appendChild(createNoteCard(note));
        });
        container.appendChild(fragment);
    }

    refreshIcons();
    syncOpenFocusModal();
}

// FOCUS VIEW & EDIT MODAL

function updateModalStats(title, content) {
    const combined = `${title || ''} ${content || ''}`.trim();
    const words = combined ? combined.split(/\s+/).length : 0;
    const readMins = words > 0 ? Math.max(1, Math.ceil(words / 200)) : 0;
    const statsEl = document.getElementById('modalStats');
    if (statsEl) {
        statsEl.textContent = `${words} ${words === 1 ? 'word' : 'words'} · ${readMins} min read`;
    }
}

function renderFocusReadView(note) {
    const readTitle = document.getElementById('focusReadTitle');
    const readBody = document.getElementById('focusReadBody');

    const hasTitle = Boolean(note.title && note.title.trim());
    readTitle.textContent = hasTitle ? note.title : '';
    readTitle.classList.toggle('hidden', !hasTitle);

    readBody.replaceChildren(renderFormattedBody(note));
    updateModalStats(note.title, note.content);
    refreshIcons();
}

function setModalMode(mode) {
    state.modalMode = mode === 'edit' ? 'edit' : 'read';
    const isEdit = state.modalMode === 'edit';

    document.getElementById('focusReadView').classList.toggle('hidden', isEdit);
    document.getElementById('focusEditView').classList.toggle('hidden', !isEdit);
    document.getElementById('modalEditButtons').classList.toggle('hidden', !isEdit);

    document.getElementById('editModalTitle').textContent = isEdit ? 'Edit Note' : 'Focus View';
    document.getElementById('modalShortcutHint').textContent = isEdit
        ? 'Ctrl + Enter to save · Esc to cancel'
        : 'Click checklists to toggle · Esc to close';

    const modeBtn = document.getElementById('modalModeToggleBtn');
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', isEdit ? 'eye' : 'pencil');
    const label = document.createElement('span');
    label.id = 'modalModeLabel';
    label.textContent = isEdit ? 'Read' : 'Edit';
    modeBtn.replaceChildren(icon, label);
    refreshIcons();

    if (isEdit) {
        const contentInput = document.getElementById('editContentInput');
        autoResizeTextarea(contentInput);
        updateModalStats(
            document.getElementById('editTitleInput').value,
            contentInput.value
        );
        contentInput.focus();
    } else {
        const current = state.notes.find((n) => n.id === state.editingNoteId);
        if (current) {
            renderFocusReadView(current);
        }
    }
}

function syncOpenFocusModal() {
    if (state.editingNoteId === null) return;
    const modal = document.getElementById('editModal');
    if (modal.classList.contains('hidden')) return;

    const current = state.notes.find((n) => n.id === state.editingNoteId);
    if (!current) {
        closeEditModal();
        return;
    }

    state.editColor = current.color || 'default';
    state.editPinned = Boolean(current.pinned);
    setColorPickerSelection('editColors', 'editModalCard', state.editColor);
    setPinButtonState('editPinBtn', state.editPinned);
    document.getElementById('editTagSelect').value = current.tag || 'General';

    if (state.modalMode === 'read') {
        renderFocusReadView(current);
    }
}

function openFocusModal(note, mode = 'read') {
    state.editingNoteId = note.id;
    state.editColor = note.color || 'default';
    state.editPinned = Boolean(note.pinned);

    const titleInput = document.getElementById('editTitleInput');
    const contentInput = document.getElementById('editContentInput');
    const tagSelect = document.getElementById('editTagSelect');

    titleInput.value = note.title || '';
    contentInput.value = note.content || '';
    tagSelect.value = note.tag || 'General';

    setColorPickerSelection('editColors', 'editModalCard', state.editColor);
    setPinButtonState('editPinBtn', state.editPinned);
    renderFocusReadView(note);

    document.getElementById('editModal').classList.remove('hidden');
    setModalMode(mode);
}

function closeEditModal() {
    state.editingNoteId = null;
    document.getElementById('editModal').classList.add('hidden');
}

async function saveEditedNote() {
    if (state.editingNoteId === null) return;

    const title = document.getElementById('editTitleInput').value.trim();
    const contentInput = document.getElementById('editContentInput');
    const content = contentInput.value;
    const tag = document.getElementById('editTagSelect').value;

    if (content.trim() === '') {
        showToast('Note content cannot be empty!');
        contentInput.focus();
        return;
    }

    const ok = await updateNoteById(
        state.editingNoteId,
        {
            title,
            content,
            tag,
            color: state.editColor,
            pinned: state.editPinned
        },
        'Note Updated'
    );

    if (ok) {
        closeEditModal();
    }
}

// EVENT INITIALIZATION

function clearSearch() {
    const searchInput = document.getElementById('search');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    state.searchQuery = '';
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    renderNotes();
}

function isEditableElement(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function bindEvents() {
    const noteTitleInput = document.getElementById('noteTitleInput');
    const noteInput = document.getElementById('noteInput');
    const searchInput = document.getElementById('search');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const editTitleInput = document.getElementById('editTitleInput');
    const editContentInput = document.getElementById('editContentInput');
    const templateToggleBtn = document.getElementById('templateToggleBtn');
    const templateMenu = document.getElementById('templateMenu');
    const exportToggleBtn = document.getElementById('exportToggleBtn');
    const exportMenu = document.getElementById('exportMenu');
    const importFileInput = document.getElementById('importFileInput');
    const slashMenu = document.getElementById('slashMenu');

    // Composer textarea auto-expand, counter, slash commands, and Ctrl/Cmd+Enter save
    noteInput.addEventListener('input', () => {
        autoResizeTextarea(noteInput);
        updateComposerCounter();
        updateSlashMenuFromInput(noteInput);
    });

    noteInput.addEventListener('keydown', (e) => {
        const isSlashOpen = !slashMenu.classList.contains('hidden') && state.slashMatches.length > 0;
        if (isSlashOpen) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                state.slashActiveIndex = (state.slashActiveIndex + 1) % state.slashMatches.length;
                renderSlashMenu();
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                state.slashActiveIndex =
                    (state.slashActiveIndex - 1 + state.slashMatches.length) % state.slashMatches.length;
                renderSlashMenu();
                return;
            }
            if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
                e.preventDefault();
                applySlashCommand(state.slashMatches[state.slashActiveIndex]);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeSlashMenu();
                return;
            }
        }
    });

    [noteTitleInput, noteInput].forEach((el) => {
        el.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                saveNote();
            }
        });
    });

    // Voice dictation, export menu, & JSON import
    document.getElementById('voiceDictationBtn').addEventListener('click', toggleVoiceDictation);

    exportToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTemplateMenu();
        const isHidden = exportMenu.classList.toggle('hidden');
        exportToggleBtn.setAttribute('aria-expanded', String(!isHidden));
    });

    exportMenu.addEventListener('click', (e) => {
        const item = e.target.closest('[data-export]');
        if (!item) return;
        if (item.dataset.export === 'md') {
            exportNotesAsMarkdown();
        } else if (item.dataset.export === 'json') {
            exportNotesAsJson();
        }
    });

    document.getElementById('importNotesBtn').addEventListener('click', () => {
        importFileInput.click();
    });

    importFileInput.addEventListener('change', async () => {
        const [file] = importFileInput.files || [];
        if (file) {
            await importNotesFromFile(file);
            importFileInput.value = '';
        }
    });

    // Templates dropdown
    templateToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeExportMenu();
        const isHidden = templateMenu.classList.toggle('hidden');
        templateToggleBtn.setAttribute('aria-expanded', String(!isHidden));
    });

    templateMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.template-item');
        if (!item) return;
        applyTemplate(item.dataset.template);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.template-dropdown')) {
            closeTemplateMenu();
        }
        if (!e.target.closest('.export-dropdown')) {
            closeExportMenu();
        }
        if (!e.target.closest('.composer-textarea-wrap')) {
            closeSlashMenu();
        }
    });

    // Composer pin & colors
    document.getElementById('composerPinBtn').addEventListener('click', () => {
        state.composerPinned = !state.composerPinned;
        setPinButtonState('composerPinBtn', state.composerPinned);
    });

    document.getElementById('composerColors').addEventListener('click', (e) => {
        const swatch = e.target.closest('.color-swatch');
        if (!swatch) return;
        state.composerColor = swatch.dataset.color;
        setColorPickerSelection('composerColors', 'composerCard', state.composerColor);
    });

    // Search & Clear
    searchInput.addEventListener('input', () => {
        state.searchQuery = searchInput.value;
        clearSearchBtn.classList.toggle('hidden', state.searchQuery === '');
        renderNotes();
    });

    clearSearchBtn.addEventListener('click', () => {
        clearSearch();
        searchInput.focus();
    });

    // Filter pills
    document.getElementById('filterPills').addEventListener('click', (e) => {
        const pill = e.target.closest('.filter-pill');
        if (!pill) return;
        state.activeFilter = pill.dataset.filter;
        document.querySelectorAll('.filter-pill').forEach((btn) => {
            const active = btn === pill;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', String(active));
        });
        renderNotes();
    });

    // Sort toggle
    document.getElementById('sortToggleBtn').addEventListener('click', () => {
        state.sortOrder = state.sortOrder === 'newest' ? 'oldest' : 'newest';
        document.getElementById('sortLabel').textContent =
            state.sortOrder === 'newest' ? 'Newest' : 'Oldest';
        renderNotes();
    });

    // View mode toggle (Grid / List)
    document.getElementById('gridViewBtn').addEventListener('click', () => setViewMode('grid'));
    document.getElementById('listViewBtn').addEventListener('click', () => setViewMode('list'));

    // Reset filters button in empty state
    document.getElementById('resetFiltersBtn').addEventListener('click', () => {
        state.activeFilter = 'All';
        clearSearch();
        document.querySelectorAll('.filter-pill').forEach((btn) => {
            const isAll = btn.dataset.filter === 'All';
            btn.classList.toggle('active', isAll);
            btn.setAttribute('aria-selected', String(isAll));
        });
        renderNotes();
    });

    // Focus & Edit modal events
    document.getElementById('modalModeToggleBtn').addEventListener('click', () => {
        setModalMode(state.modalMode === 'read' ? 'edit' : 'read');
    });

    document.getElementById('editPinBtn').addEventListener('click', async () => {
        state.editPinned = !state.editPinned;
        setPinButtonState('editPinBtn', state.editPinned);
        if (state.modalMode === 'read' && state.editingNoteId !== null) {
            await updateNoteById(
                state.editingNoteId,
                { pinned: state.editPinned },
                state.editPinned ? 'Note pinned' : 'Note unpinned'
            );
        }
    });

    document.getElementById('editTagSelect').addEventListener('change', async (e) => {
        if (state.modalMode === 'read' && state.editingNoteId !== null) {
            await updateNoteById(
                state.editingNoteId,
                { tag: e.target.value },
                'Tag updated'
            );
        }
    });

    document.getElementById('editColors').addEventListener('click', async (e) => {
        const swatch = e.target.closest('.color-swatch');
        if (!swatch) return;
        state.editColor = swatch.dataset.color;
        setColorPickerSelection('editColors', 'editModalCard', state.editColor);
        if (state.modalMode === 'read' && state.editingNoteId !== null) {
            await updateNoteById(
                state.editingNoteId,
                { color: state.editColor },
                'Color updated'
            );
        }
    });

    editTitleInput.addEventListener('input', () => {
        updateModalStats(editTitleInput.value, editContentInput.value);
    });

    editContentInput.addEventListener('input', () => {
        autoResizeTextarea(editContentInput);
        updateModalStats(editTitleInput.value, editContentInput.value);
    });

    [editTitleInput, editContentInput].forEach((el) => {
        el.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                saveEditedNote();
            }
        });
    });

    document.getElementById('saveEditBtn').addEventListener('click', saveEditedNote);
    document.getElementById('cancelEditBtn').addEventListener('click', () => {
        if (state.editingNoteId !== null) {
            const current = state.notes.find((n) => n.id === state.editingNoteId);
            if (current) {
                openFocusModal(current, 'read');
                return;
            }
        }
        closeEditModal();
    });
    document.getElementById('closeModalBtn').addEventListener('click', closeEditModal);

    document.getElementById('editModal').addEventListener('click', (e) => {
        if (e.target.id === 'editModal') {
            closeEditModal();
        }
    });

    // Global keyboard shortcuts: '/' to focus search, 'Escape' to close modal/menus or clear search
    document.addEventListener('keydown', (e) => {
        const editModal = document.getElementById('editModal');
        const isModalOpen = !editModal.classList.contains('hidden');

        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isModalOpen && !isEditableElement(document.activeElement)) {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
            return;
        }

        if (e.key === 'Escape') {
            if (isModalOpen) {
                closeEditModal();
                return;
            }
            if (!slashMenu.classList.contains('hidden')) {
                closeSlashMenu();
                return;
            }
            if (!templateMenu.classList.contains('hidden')) {
                closeTemplateMenu();
                return;
            }
            if (!exportMenu.classList.contains('hidden')) {
                closeExportMenu();
                return;
            }
            if (state.searchQuery !== '') {
                clearSearch();
                return;
            }
            if (document.activeElement === searchInput) {
                searchInput.blur();
            }
        }
    });
}

applySavedTheme();

window.addEventListener('DOMContentLoaded', () => {
    applySavedTheme();
    applySavedViewMode();
    bindEvents();
    updateComposerCounter();
    refreshIcons();
    loadNotes();
});
