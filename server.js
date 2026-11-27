const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');
const ALLOWED_COLORS = new Set(['default', 'amber', 'emerald', 'sky', 'rose', 'violet']);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let writeQueue = Promise.resolve();

/**
 * Serialize write operations to prevent concurrent read-modify-write races.
 * @param {Function} task
 * @returns {Promise<any>}
 */
function withWriteLock(task) {
    const run = writeQueue.then(task, task);
    writeQueue = run.catch(() => {});
    return run;
}

/**
 * Ensure the data directory and notes.json file exist.
 */
async function ensureDataFile() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
        await fs.access(NOTES_FILE);
    } catch (err) {
        if (err.code === 'ENOENT') {
            await fs.writeFile(NOTES_FILE, '[]', 'utf8');
        } else {
            throw err;
        }
    }
}

/**
 * Read all notes from data/notes.json.
 * @returns {Promise<Array>}
 */
async function readNotes() {
    await ensureDataFile();
    const raw = await fs.readFile(NOTES_FILE, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
}

/**
 * Persist notes array to data/notes.json.
 * @param {Array} notes
 */
async function writeNotes(notes) {
    await ensureDataFile();
    await fs.writeFile(NOTES_FILE, JSON.stringify(notes, null, 2), 'utf8');
}

/**
 * Format a Date object as 'DD-MM-YYYY hh:mm AM/PM'.
 * @param {Date} date
 * @returns {string}
 */
function formatTimestamp(date = new Date()) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours24 = date.getHours();
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = String(hours24 % 12 || 12).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}-${month}-${year} ${hours12}:${minutes} ${period}`;
}

/**
 * Validate and trim note content.
 * @param {any} content
 * @returns {string|null}
 */
function getValidatedContent(content) {
    if (typeof content !== 'string') {
        return null;
    }
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalize optional title string.
 * @param {any} title
 * @returns {string}
 */
function normalizeTitle(title) {
    return typeof title === 'string' ? title.trim() : '';
}

/**
 * Normalize optional tag string, defaulting to 'General'.
 * @param {any} tag
 * @returns {string}
 */
function normalizeTag(tag) {
    if (typeof tag === 'string' && tag.trim().length > 0) {
        return tag.trim();
    }
    return 'General';
}

/**
 * Normalize optional color against allowed palette values.
 * @param {any} color
 * @returns {string}
 */
function normalizeColor(color) {
    if (typeof color === 'string') {
        const trimmed = color.trim();
        if (ALLOWED_COLORS.has(trimmed)) {
            return trimmed;
        }
    }
    return 'default';
}

/**
 * Normalize a note object, filling defaults for legacy notes.
 * @param {object} note
 * @returns {object}
 */
function normalizeNote(note) {
    return {
        id: Number(note.id),
        title: normalizeTitle(note.title),
        content: typeof note.content === 'string' ? note.content : '',
        tag: normalizeTag(note.tag),
        color: normalizeColor(note.color),
        pinned: typeof note.pinned === 'boolean' ? note.pinned : false,
        created_at: typeof note.created_at === 'string' ? note.created_at : formatTimestamp()
    };
}

// GET /notes - Return all notes sorted with pinned first, then newest first by id
app.get('/notes', async (req, res) => {
    try {
        const notes = await readNotes();
        const normalized = notes.map(normalizeNote);
        normalized.sort((a, b) => {
            if (a.pinned !== b.pinned) {
                return a.pinned ? -1 : 1;
            }
            return b.id - a.id;
        });
        res.status(200).json(normalized);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load notes' });
    }
});

// POST /notes - Create a new note
app.post('/notes', async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const trimmedContent = getValidatedContent(body.content);
    if (!trimmedContent) {
        return res.status(400).json({ error: 'Content must be a non-empty string' });
    }

    try {
        const newNote = await withWriteLock(async () => {
            const notes = await readNotes();
            let id = Date.now();
            while (notes.some((note) => Number(note.id) === id)) {
                id += 1;
            }

            const note = {
                id,
                title: normalizeTitle(body.title),
                content: trimmedContent,
                tag: normalizeTag(body.tag),
                color: normalizeColor(body.color),
                pinned: typeof body.pinned === 'boolean' ? body.pinned : false,
                created_at: formatTimestamp()
            };

            notes.unshift(note);
            await writeNotes(notes);
            return note;
        });

        res.status(201).json(newNote);
    } catch (error) {
        res.status(500).json({ error: 'Failed to save note' });
    }
});

// PUT /notes/:id - Partially or fully update an existing note
app.put('/notes/:id', async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const hasContent = Object.prototype.hasOwnProperty.call(body, 'content');
    let trimmedContent = null;

    if (hasContent) {
        trimmedContent = getValidatedContent(body.content);
        if (!trimmedContent) {
            return res.status(400).json({ error: 'Content must be a non-empty string' });
        }
    }

    const id = Number(req.params.id);

    try {
        const updatedNote = await withWriteLock(async () => {
            const notes = await readNotes();
            const index = notes.findIndex((note) => Number(note.id) === id);
            if (index === -1) {
                return null;
            }

            const existing = normalizeNote(notes[index]);
            const nextNote = {
                ...existing,
                title: Object.prototype.hasOwnProperty.call(body, 'title')
                    ? normalizeTitle(body.title)
                    : existing.title,
                content: hasContent ? trimmedContent : existing.content,
                tag: Object.prototype.hasOwnProperty.call(body, 'tag')
                    ? normalizeTag(body.tag)
                    : existing.tag,
                color: Object.prototype.hasOwnProperty.call(body, 'color')
                    ? normalizeColor(body.color)
                    : existing.color,
                pinned: Object.prototype.hasOwnProperty.call(body, 'pinned') && typeof body.pinned === 'boolean'
                    ? body.pinned
                    : existing.pinned
            };

            notes[index] = nextNote;
            await writeNotes(notes);
            return nextNote;
        });

        if (!updatedNote) {
            return res.status(404).json({ error: 'Note not found' });
        }

        res.status(200).json(updatedNote);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update note' });
    }
});

// DELETE /notes/:id - Delete a note by ID
app.delete('/notes/:id', async (req, res) => {
    const id = Number(req.params.id);

    try {
        const deleted = await withWriteLock(async () => {
            const notes = await readNotes();
            const index = notes.findIndex((note) => Number(note.id) === id);
            if (index === -1) {
                return false;
            }

            notes.splice(index, 1);
            await writeNotes(notes);
            return true;
        });

        if (!deleted) {
            return res.status(404).json({ error: 'Note not found' });
        }

        res.status(200).json({ message: 'Deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete note' });
    }
});

ensureDataFile()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Scribbly server running on http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error('Failed to initialize storage:', error);
        process.exit(1);
    });
