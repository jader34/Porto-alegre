/**
 * Obsidian Mobile Reader - App Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // State
    const state = {
        notes: window.NOTES_DATA || [],
        currentNote: null,
        activeFolder: 'Anotação', // Default to Anotação as requested
        searchQuery: '',
        theme: localStorage.getItem('obsidian_theme') || 'dark',
        fontFamily: localStorage.getItem('obsidian_font') || 'sans',
        fontSize: parseInt(localStorage.getItem('obsidian_size')) || 16,
    };

    // DOM Elements
    const elements = {
        sidebar: document.getElementById('sidebar'),
        sidebarOverlay: document.getElementById('sidebar-overlay'),
        btnMenu: document.getElementById('btn-menu'),
        btnControls: document.getElementById('btn-controls'),
        controlsModal: document.getElementById('controls-modal'),
        currentTitle: document.getElementById('current-title'),
        searchInput: document.getElementById('search-input'),
        filterContainer: document.getElementById('filter-container'),
        notesList: document.getElementById('notes-list'),
        readerContainer: document.getElementById('reader-container'),
        fabTop: document.getElementById('fab-top'),
        mainContent: document.getElementById('main-content'),
    };

    // Initialize Marked Renderer with custom Obsidian rules
    const renderer = new marked.Renderer();

    // Custom Obsidian Callouts parsing in Markdown
    function parseObsidianCallouts(markdown) {
        const calloutRegex = /^>\s*\[!([A-Za-z]+)\]\s*(.*)?(?:\n((?:>.*\n?)*))?/gm;
        return markdown.replace(calloutRegex, (match, type, title, body) => {
            const cleanType = type.toLowerCase();
            const calloutTitle = title || type.charAt(0).toUpperCase() + type.slice(1);
            const cleanBody = body ? body.replace(/^>\s?/gm, '') : '';
            
            return `<div class="obsidian-callout ${cleanType}">
                <div class="callout-title ${cleanType}">
                    <span>📌 ${calloutTitle}</span>
                </div>
                <div class="callout-content">${marked.parse(cleanBody)}</div>
            </div>`;
        });
    }

    // Custom Obsidian Wikilinks [[Note Name]] parsing
    function parseWikilinks(content) {
        return content.replace(/\[\[(.*?)\]\]/g, (match, noteName) => {
            const targetNote = state.notes.find(n => 
                n.title.toLowerCase() === noteName.toLowerCase() || 
                n.filename.replace('.md', '').toLowerCase() === noteName.toLowerCase()
            );
            if (targetNote) {
                return `<a href="#${encodeURIComponent(targetNote.id)}" class="wikilink" data-note-id="${targetNote.id}">${noteName}</a>`;
            }
            return `<span class="wikilink-unresolved">${noteName}</span>`;
        });
    }

    // Apply Settings (Theme, Font, Size)
    function applySettings() {
        document.documentElement.setAttribute('data-theme', state.theme);
        document.documentElement.style.setProperty('--current-font', state.fontFamily === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)');
        document.documentElement.style.setProperty('--base-font-size', `${state.fontSize}px`);

        localStorage.setItem('obsidian_theme', state.theme);
        localStorage.setItem('obsidian_font', state.fontFamily);
        localStorage.setItem('obsidian_size', state.fontSize);

        // Update control buttons active states
        document.querySelectorAll('[data-theme-set]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-theme-set') === state.theme);
        });
        document.querySelectorAll('[data-font-set]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-font-set') === state.fontFamily);
        });
    }

    // Render Folders Pill Filters
    function renderFilters() {
        const folders = new Set();
        state.notes.forEach(n => folders.add(n.folder));
        
        let html = `<button class="filter-pill ${state.activeFolder === 'ALL' ? 'active' : ''}" data-folder="ALL">Tudo (${state.notes.length})</button>`;
        
        // Ensure Anotação is listed first
        if (folders.has('Anotação')) {
            const count = state.notes.filter(n => n.folder === 'Anotação').length;
            html += `<button class="filter-pill ${state.activeFolder === 'Anotação' ? 'active' : ''}" data-folder="Anotação">Anotações (${count})</button>`;
            folders.delete('Anotação');
        }

        folders.forEach(f => {
            const count = state.notes.filter(n => n.folder === f).length;
            html += `<button class="filter-pill ${state.activeFolder === f ? 'active' : ''}" data-folder="${f}">${f} (${count})</button>`;
        });

        elements.filterContainer.innerHTML = html;

        // Event listener for filter buttons
        elements.filterContainer.querySelectorAll('.filter-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                state.activeFolder = btn.getAttribute('data-folder');
                renderFilters();
                renderNotesList();
            });
        });
    }

    // Filter Notes
    function getFilteredNotes() {
        return state.notes.filter(note => {
            const matchesFolder = state.activeFolder === 'ALL' || note.folder === state.activeFolder;
            const query = state.searchQuery.toLowerCase();
            const matchesSearch = !query || 
                note.title.toLowerCase().includes(query) || 
                note.content.toLowerCase().includes(query) ||
                note.tags.some(t => t.toLowerCase().includes(query));
            return matchesFolder && matchesSearch;
        });
    }

    // Render Notes List in Sidebar
    function renderNotesList() {
        const filtered = getFilteredNotes();
        if (filtered.length === 0) {
            elements.notesList.innerHTML = `<div class="empty-state">Nenhuma nota encontrada.</div>`;
            return;
        }

        elements.notesList.innerHTML = filtered.map(note => `
            <div class="note-item ${state.currentNote && state.currentNote.id === note.id ? 'active' : ''}" data-id="${note.id}">
                <div class="note-item-title">
                    <span>${note.title}</span>
                    <span class="note-folder-tag">${note.folder}</span>
                </div>
                <div class="note-item-snippet">${note.excerpt}</div>
            </div>
        `).join('');

        // Attach click handlers
        elements.notesList.querySelectorAll('.note-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.getAttribute('data-id');
                selectNote(id);
                closeSidebar();
            });
        });
    }

    // Select & Render a Note
    function selectNote(noteId) {
        const note = state.notes.find(n => n.id === noteId);
        if (!note) return;

        state.currentNote = note;
        elements.currentTitle.textContent = note.title;
        window.location.hash = encodeURIComponent(note.id);

        // Process markdown content
        let parsedMd = parseObsidianCallouts(note.content);
        parsedMd = parseWikilinks(parsedMd);
        const htmlContent = marked.parse(parsedMd);

        elements.readerContainer.innerHTML = `
            <article class="markdown-body">
                <h1>${note.title}</h1>
                <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 20px;">
                    📂 Folder: <strong>${note.folder}</strong> | 📅 Atualizado: ${new Date(note.mtime).toLocaleDateString('pt-BR')}
                </div>
                ${htmlContent}
            </article>
        `;

        // Highlight code blocks
        elements.readerContainer.querySelectorAll('pre code').forEach((block) => {
            if (window.hljs) hljs.highlightElement(block);
        });

        // Re-render notes list to highlight active item
        renderNotesList();
        
        // Scroll to top of content
        elements.mainContent.scrollTop = 0;
    }

    // Event Handlers for Sidebar & Controls
    function toggleSidebar() {
        const isActive = elements.sidebar.classList.contains('active');
        if (isActive) closeSidebar();
        else openSidebar();
    }

    function openSidebar() {
        elements.sidebar.classList.add('active');
        elements.sidebarOverlay.classList.add('active');
    }

    function closeSidebar() {
        elements.sidebar.classList.remove('active');
        elements.sidebarOverlay.classList.remove('active');
    }

    // Handle Deep Linking via Hash
    function handleHashChange() {
        if (window.location.hash) {
            const hashId = decodeURIComponent(window.location.hash.substring(1));
            const note = state.notes.find(n => n.id === hashId);
            if (note) {
                selectNote(note.id);
                return;
            }
        }
        // Fallback: select first note in Anotação or overall list
        const defaultNote = state.notes.find(n => n.folder === 'Anotação') || state.notes[0];
        if (defaultNote) {
            selectNote(defaultNote.id);
        }
    }

    // Setup Event Listeners
    elements.btnMenu.addEventListener('click', toggleSidebar);
    elements.sidebarOverlay.addEventListener('click', closeSidebar);

    elements.btnControls.addEventListener('click', () => {
        elements.controlsModal.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!elements.controlsModal.contains(e.target) && !elements.btnControls.contains(e.target)) {
            elements.controlsModal.classList.remove('active');
        }
    });

    // Search Input
    elements.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderNotesList();
    });

    // Reading Control Buttons
    document.querySelectorAll('[data-theme-set]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.theme = btn.getAttribute('data-theme-set');
            applySettings();
        });
    });

    document.querySelectorAll('[data-font-set]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.fontFamily = btn.getAttribute('data-font-set');
            applySettings();
        });
    });

    document.getElementById('font-decrease').addEventListener('click', () => {
        if (state.fontSize > 13) {
            state.fontSize -= 1;
            applySettings();
        }
    });

    document.getElementById('font-increase').addEventListener('click', () => {
        if (state.fontSize < 24) {
            state.fontSize += 1;
            applySettings();
        }
    });

    // Scroll to Top FAB
    elements.mainContent.addEventListener('scroll', () => {
        if (elements.mainContent.scrollTop > 300) {
            elements.fabTop.classList.add('visible');
        } else {
            elements.fabTop.classList.remove('visible');
        }
    });

    elements.fabTop.addEventListener('click', () => {
        elements.mainContent.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Click Wikilinks inside reader content
    elements.readerContainer.addEventListener('click', (e) => {
        const link = e.target.closest('.wikilink');
        if (link) {
            e.preventDefault();
            const noteId = link.getAttribute('data-note-id');
            if (noteId) selectNote(noteId);
        }
    });

    window.addEventListener('hashchange', handleHashChange);

    // Initial Setup
    applySettings();
    renderFilters();
    renderNotesList();
    handleHashChange();
});
