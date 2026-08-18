const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const DOCS_DIR = path.join(ROOT_DIR, 'docs');
const OUTPUT_DATA_FILE = path.join(DOCS_DIR, 'data.js');
const OUTPUT_NOTAS_DIR = path.join(DOCS_DIR, 'notas');

// Folders to scan for notes
const TARGET_FOLDERS = ['Anotação', 'Cardápio', 'Percifds'];

function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function cleanMarkdownSnippet(text) {
    return text
        .replace(/^#+\s+/gm, '') // Remove headers
        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.*?)\*/g, '$1') // Remove italics
        .replace(/\[\[(.*?)\]\]/g, '$1') // Remove wikilinks
        .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove markdown links
        .replace(/`{1,3}.*?`{1,3}/gs, '') // Remove code blocks
        .replace(/\n+/g, ' ')
        .trim();
}

function extractTags(content) {
    const tagRegex = /(?:^|\s)#([a-zA-Z0-9_\-\/]+)/g;
    const tags = new Set();
    let match;
    while ((match = tagRegex.exec(content)) !== null) {
        // Exclude headings like # Title
        if (!match[0].startsWith(' #') && !match[0].startsWith('\n#')) {
            const lineStart = content.substring(0, match.index).split('\n').pop();
            if (lineStart.trim().startsWith('#')) continue;
        }
        tags.add(match[1]);
    }
    return Array.from(tags);
}

function scanDirectory(dirPath, baseFolder) {
    let results = [];
    if (!fs.existsSync(dirPath)) return results;

    const list = fs.readdirSync(dirPath);
    list.forEach(file => {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);

        if (stat && stat.isDirectory()) {
            results = results.concat(scanDirectory(fullPath, baseFolder));
        } else if (file.endsWith('.md')) {
            const relativePath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
            const content = fs.readFileSync(fullPath, 'utf-8');
            
            // Extract first header or use filename
            const titleMatch = content.match(/^#\s+(.+)$/m) || content.match(/^##\s+(.+)$/m);
            const title = titleMatch ? titleMatch[1].trim() : path.basename(file, '.md');
            
            const excerpt = cleanMarkdownSnippet(content).substring(0, 140) + '...';
            const tags = extractTags(content);
            const folder = relativePath.split('/')[0];
            const subFolder = relativePath.includes('/') ? path.dirname(relativePath) : '';

            // Copy to docs/notas/ for static raw access
            const destPath = path.join(OUTPUT_NOTAS_DIR, relativePath);
            ensureDirectoryExists(path.dirname(destPath));
            fs.copyFileSync(fullPath, destPath);

            results.push({
                id: relativePath,
                title: title,
                filename: file,
                folder: folder,
                subFolder: subFolder,
                path: relativePath,
                excerpt: excerpt,
                tags: tags,
                content: content,
                mtime: stat.mtime
            });
        }
    });

    return results;
}

function build() {
    console.log('📦 Iniciando compilação do site das Anotações...');
    ensureDirectoryExists(DOCS_DIR);
    ensureDirectoryExists(OUTPUT_NOTAS_DIR);

    let allNotes = [];

    // Scan target folders
    TARGET_FOLDERS.forEach(folder => {
        const folderPath = path.join(ROOT_DIR, folder);
        if (fs.existsSync(folderPath)) {
            console.log(`🔍 Lendo pasta: ${folder}`);
            const notes = scanDirectory(folderPath, folder);
            allNotes = allNotes.concat(notes);
        }
    });

    // Also check root .md files like abu.md
    const rootFiles = fs.readdirSync(ROOT_DIR);
    rootFiles.forEach(file => {
        if (file.endsWith('.md') && file !== 'README.md') {
            const fullPath = path.join(ROOT_DIR, file);
            const stat = fs.statSync(fullPath);
            const content = fs.readFileSync(fullPath, 'utf-8');
            const titleMatch = content.match(/^#\s+(.+)$/m);
            const title = titleMatch ? titleMatch[1].trim() : path.basename(file, '.md');
            const excerpt = cleanMarkdownSnippet(content).substring(0, 140) + '...';

            allNotes.push({
                id: file,
                title: title,
                filename: file,
                folder: 'Raiz',
                subFolder: '',
                path: file,
                excerpt: excerpt,
                tags: extractTags(content),
                content: content,
                mtime: stat.mtime
            });
        }
    });

    // Sort notes: Anotação first, then by modified time
    allNotes.sort((a, b) => {
        if (a.folder === 'Anotação' && b.folder !== 'Anotação') return -1;
        if (a.folder !== 'Anotação' && b.folder === 'Anotação') return 1;
        return new Date(b.mtime) - new Date(a.mtime);
    });

    // Output data.js
    const jsContent = `// Gerado automaticamente pelo build.js em ${new Date().toLocaleString('pt-BR')}
window.NOTES_DATA = ${JSON.stringify(allNotes, null, 2)};
`;

    fs.writeFileSync(OUTPUT_DATA_FILE, jsContent, 'utf-8');
    console.log(`✅ Sucesso! Total de ${allNotes.length} notas compiladas em ${OUTPUT_DATA_FILE}`);
}

build();
