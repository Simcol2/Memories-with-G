!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Memories with G - Collaborative Photobook</title>
    <!-- Load Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- Use Inter font family -->
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Shadows+Into+Light&display=swap');
        body {
            font-family: 'Inter', sans-serif;
            background-color: #f7f9fb;
        }
        /* Custom style for Scrapbook layout text */
        .font-handwriting {
            font-family: 'Shadows Into Light', cursive;
        }
        /* Page size aspect ratio */
        .photobook-page {
            aspect-ratio: 1.4 / 1;
        }
    </style>
    <!-- Load Lucide Icons for use in JS -->
    <script type="module">
        import { createIcons, icons } from "https://cdn.jsdelivr.net/npm/lucide@latest/dist/esm/lucide.js";
        window.lucide = { createIcons, icons };
    </script>
</head>
<body class="antialiased">

<div id="app" class="flex h-screen overflow-hidden">
    <!-- Content will be rendered here by JavaScript -->
</div>

<!-- Firebase and App Logic -->
<script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
    import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
    import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

    // --- Configuration and Initialization ---

    // Global variables provided by the environment (must be accessed safely)
    const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : (typeof __app_id !== 'undefined' ? __app_id : 'default-photobook-id');
    const firebaseConfig = typeof window.__firebase_config !== 'undefined' ? window.__firebase_config : (typeof __firebase_config !== 'undefined' ? __firebase_config : {});
    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

    let app, db, auth;
    let currentUserId = null;
    let pages = [];
    let activePageIndex = 0;
    let isEditing = true;
    let isLoading = true;
    let isSaving = false;
    let saveStatus = null; // 'success', 'error'

    const INITIAL_PAGES = [
        { id: 1, layout: 'hero', content: { title: 'Memories with G', text: 'This is our shared digital photobook. All changes are saved automatically and seen by everyone with the link!', photos: [], captions: [] } },
    ];

    // Lightweight SVG icon helper (simple placeholders to avoid external API mismatch)
    const IconSVG = (name, size = 16, cls = '') => {
        const cattr = cls ? ` class="${cls}"` : '';
        const s = size;
        switch (name) {
            case 'Loader2':
                return `<svg${cattr} xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9"/></svg>`;
            case 'Plus':
                return `<svg${cattr} xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`;
            case 'ChevronLeft':
                return `<svg${cattr} xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>`;
            case 'ChevronRight':
                return `<svg${cattr} xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>`;
            case 'Image':
                return `<svg${cattr} xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="14" rx="2"/><circle cx="9" cy="8" r="1"/><path d="M21 21l-6-6-4 4-3-3-2 2"/></svg>`;
            default:
                return `<svg${cattr} xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`;
        }
    };

    // Debounce timer for auto-saving
    let saveTimeout = null;
    
    // Reference to the file input element
    let fileInputRef;
    let activePhotoIndex = null;

    // --- Firebase and Data Logic ---

    const getBookRef = () => {
        if (db) {
            // Use the public path for collaborative data
            const path = `/artifacts/${appId}/public/data/photobook/shared_book`;
            return doc(db, path);
        }
        return null;
    };

    const saveBook = async (currentPages) => {
        const bookRef = getBookRef();
        if (!bookRef) return;
        
        isSaving = true;
        saveStatus = null;
        renderApp();

        try {
            await setDoc(bookRef, { 
                pages: currentPages,
                updatedBy: currentUserId,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            saveStatus = 'success';
            console.log("Photobook saved successfully to shared collection.");
        } catch (error) {
            console.error("Error saving shared photobook:", error);
            saveStatus = 'error';
        } finally {
            isSaving = false;
            renderApp();
            setTimeout(() => {
                saveStatus = null;
                renderApp();
            }, 3000); 
        }
    };

    const debouncedSave = (newPages) => {
        pages = newPages; // Update the global state immediately
        renderApp(); // Rerender immediately to show user change
        
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }
        saveTimeout = setTimeout(() => saveBook(pages), 1000);
    };

    const loadBook = () => {
        const bookRef = getBookRef();
        if (!bookRef) return;

        // Attach real-time listener
        onSnapshot(bookRef, (docSnap) => {
            if (docSnap.exists() && docSnap.data().pages) {
                console.log("Loading shared photobook from Firestore.");
                const loadedPages = docSnap.data().pages;
                pages = loadedPages;
                activePageIndex = Math.min(activePageIndex, loadedPages.length - 1);
            } else if (pages.length === 0) { 
                console.log("No data found. Initializing default shared photobook.");
                pages = INITIAL_PAGES;
            }
            isLoading = false;
            renderApp();
        }, (error) => {
            console.error("Error listening to photobook data:", error);
            isLoading = false;
            renderApp();
        });
    };

    const initializeFirebase = async () => {
        if (!Object.keys(firebaseConfig).length) {
            console.error("Firebase config is missing.");
            isLoading = false;
            renderApp();
            return;
        }

        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Authentication
        try {
            if (initialAuthToken) {
                await signInWithCustomToken(auth, initialAuthToken);
            } else {
                await signInAnonymously(auth); 
            }
        } catch (error) {
            console.error("Firebase authentication failed:", error);
        }

        // Auth State Listener
        onAuthStateChanged(auth, (user) => {
            currentUserId = user?.uid || `anonymous-${appId}`;
            if (db) {
                loadBook(); // Start loading data once authenticated/identified
            }
        });
    };

    // --- App Logic Handlers ---

    const handleAddPage = () => {
        const newPage = {
            id: Date.now(),
            layout: 'hero',
            content: { title: 'New Shared Memory', text: 'Add a description here...', photos: [], captions: [] }
        };
        debouncedSave([...pages, newPage]);
        activePageIndex = pages.length; 
    };

    const handleDeletePage = () => {
        if (pages.length <= 1) return; 
        const newPages = pages.filter((_, i) => i !== activePageIndex);
        activePageIndex = Math.max(0, activePageIndex - 1);
        debouncedSave(newPages);
    };

    const handleMovePage = (direction) => {
        if ((direction === 'up' && activePageIndex > 0) || (direction === 'down' && activePageIndex < pages.length - 1)) {
            const newPages = [...pages];
            const targetIndex = direction === 'up' ? activePageIndex - 1 : activePageIndex + 1;
            [newPages[activePageIndex], newPages[targetIndex]] = [newPages[targetIndex], newPages[activePageIndex]];
            activePageIndex = targetIndex;
            debouncedSave(newPages);
        }
    };

    const handleUpdateContent = (field, value, index = null) => {
        const newPages = [...pages];
        const page = newPages[activePageIndex];
        
        if (!page.content) page.content = { title: '', text: '', photos: [], captions: [] };

        if (field === 'caption') {
            if (!page.content.captions) page.content.captions = [];
            page.content.captions[index] = value;
        } else if (field === 'title' || field === 'text') {
            page.content[field] = value;
        }
        
        debouncedSave(newPages);
    };
    
    const handleChangeLayout = (type) => {
        const newPages = [...pages];
        newPages[activePageIndex].layout = type;
        debouncedSave(newPages);
    };

    // Image Upload Logic
    const triggerUpload = (photoIndex) => {
        activePhotoIndex = photoIndex;
        fileInputRef.click();
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file && activePhotoIndex !== null) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const newPages = [...pages];
                const page = newPages[activePageIndex];
                if (!page.content.photos) page.content.photos = [];
                page.content.photos[activePhotoIndex] = event.target.result;
                debouncedSave(newPages);
            };
            reader.readAsDataURL(file);
        }
        e.target.value = null; 
    };
    
    // Copy the App ID to the clipboard
    const copyAppIdToClipboard = () => {
        const tempInput = document.createElement('textarea');
        tempInput.value = appId;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        const copyMessage = document.getElementById('copy-message');
        copyMessage.textContent = 'Copied!';
        copyMessage.classList.remove('opacity-0');
        setTimeout(() => copyMessage.classList.add('opacity-0'), 1500);
    };

    // --- Renderer Functions (HTML Generation) ---

    // Generic Input/Textarea component for editing
    const EditableText = (type, value, onChange, className, placeholder, isEditing, style = '', tag = 'input', index = null) => {
        if (isEditing) {
            const indexArg = index !== null ? `, ${index}` : '';

            if (tag === 'textarea') {
                return `<textarea oninput="handleUpdateContent('${type}', this.value${indexArg})" class="${className}" placeholder="${placeholder}" style="${style}">${value}</textarea>`;
            } else { // Default to input
                 return `<input type="text" oninput="handleUpdateContent('${type}', this.value${indexArg})" class="${className}" placeholder="${placeholder}" style="${style}" value="${value.replace(/"/g, '&quot;')}" />`;
            }
        } else {
            if (tag === 'textarea') {
                // For view mode, render textarea content as multi-line
                return `<p class="${className}" style="white-space: pre-line; ${style}">${value || placeholder}</p>`;
            } else {
                 return `<h2 class="${className}" style="${style}">${value || placeholder}</h2>`;
            }
        }
    };

    const PhotoSlot = (photoUrl, photoIndex, isEditing, layoutClass = "") => {
        const placeholderContent = `
            <div class="text-gray-400 flex flex-col items-center">
                ${IconSVG('Image', 24)}
                <span class="text-sm">Add Photo</span>
            </div>
        `;
        
        const photoContent = photoUrl 
            ? `<img src="${photoUrl}" alt="Memory Photo" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='https://placehold.co/150x100/F0F4F8/9CA3AF?text=Image+Failed';" />`
            : placeholderContent;

        const uploadOverlay = isEditing ? `
            <div class="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity cursor-pointer" onclick="triggerUpload(${photoIndex})">
                ${IconSVG('Upload', 24, 'text-white drop-shadow-md')}
            </div>
        ` : '';

        return `
            <div class="relative flex-1 bg-gray-100 rounded-lg overflow-hidden group border border-gray-200 ${layoutClass} flex items-center justify-center">
                ${photoContent}
                ${uploadOverlay}
            </div>
        `;
    };
    
    // Caption input field
    const CaptionInput = (caption, photoIndex, isEditing, extraClass = "") => {
        if (isEditing) {
            return `
                <input
                    type="text"
                    value="${caption ? caption.replace(/"/g, '&quot;') : ''}"
                    oninput="handleUpdateContent('caption', this.value, ${photoIndex})"
                    class="w-full text-xs text-gray-500 text-center bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 outline-none ${extraClass}"
                    placeholder="Caption..."
                />
            `;
        } else if (caption) {
            return `<p class="text-xs text-gray-500 text-center ${extraClass}">${caption}</p>`;
        }
        return '';
    };

    // --- Layout Renderers (HTML) ---
    const renderLayout = (page) => {
        const { layout, content } = page;
        const photos = content.photos || [];
        const captions = content.captions || [];

        const props = {
            title: content.title || '',
            text: content.text || '',
            isEditing: isEditing,
        };

        switch (layout) {
            case 'hero': 
                return `
                    <div class="flex flex-col h-full p-8 bg-white shadow-sm">
                        <div class="flex-1 relative mb-6">
                            ${PhotoSlot(photos[0], 0, props.isEditing, "h-full w-full")}
                        </div>
                        <div class="space-y-4 text-center">
                            ${EditableText('title', props.title, null, 'w-full text-3xl font-serif text-center text-gray-800 border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none bg-transparent transition-colors placeholder-gray-300', 'Memory Title', props.isEditing)}
                            ${EditableText('text', props.text, null, 'w-full text-gray-600 text-center border-l-2 border-transparent hover:border-gray-300 focus:border-blue-500 outline-none bg-transparent resize-none h-24 p-2 placeholder-gray-300', 'Write about this moment...', props.isEditing, '', 'textarea')}
                        </div>
                    </div>
                `;

            case 'split':
                return `
                    <div class="flex flex-row h-full bg-white shadow-sm">
                        <div class="w-1/2 p-6 relative group flex flex-col">
                            ${PhotoSlot(photos[0], 0, props.isEditing)}
                            <div class="mt-3 h-6">
                                ${CaptionInput(captions[0], 0, props.isEditing)}
                            </div>
                        </div>

                        <div class="w-1/2 p-8 flex flex-col justify-center space-y-6">
                            ${EditableText('title', props.title, null, 'w-full text-4xl font-serif text-gray-800 border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none bg-transparent', 'Title', props.isEditing)}
                            ${EditableText('text', props.text, null, 'w-full h-64 text-gray-600 text-lg leading-relaxed border-l-2 border-transparent hover:border-gray-300 focus:border-blue-500 outline-none bg-transparent resize-none p-2', 'Tell the story...', props.isEditing, '', 'textarea')}
                        </div>
                    </div>
                `;

            case 'grid':
                const gridItems = [0, 1, 2, 3].map(index => `
                    <div class="flex flex-col h-full">
                        ${PhotoSlot(photos[index], index, props.isEditing)}
                        <div class="mt-2 h-6">
                            ${CaptionInput(captions[index], index, props.isEditing)}
                        </div>
                    </div>
                `).join('');

                return `
                    <div class="h-full p-8 bg-white flex flex-col">
                        <div class="mb-6 text-center">
                            ${EditableText('title', props.title, null, 'text-2xl font-medium text-gray-800 text-center bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none', 'Gallery Title', props.isEditing, '', 'input')}
                        </div>
                        <div class="grid grid-cols-2 grid-rows-2 gap-6 flex-1">
                            ${gridItems}
                        </div>
                    </div>
                `;
            case 'scrapbook':
                const rotations = ['-rotate-2', 'rotate-3', '-rotate-1'];
                const photoPositions = [
                    { top: '0%', left: '5%' },
                    { top: '10%', left: '50%' },
                    { top: '45%', left: '25%' },
                ];
                
                const scrapbookPhotos = [0, 1, 2].map(index => `
                    <div 
                        class="absolute p-3 bg-white shadow-md transform transition-transform hover:z-20 hover:scale-105 ${rotations[index]}"
                        style="width: 45%; height: 50%; top: ${photoPositions[index].top}; left: ${photoPositions[index].left};"
                    >
                        <div class="w-full h-[80%] bg-gray-100 overflow-hidden relative group">
                            ${PhotoSlot(photos[index], index, props.isEditing)}
                        </div>
                        <div class="h-[20%] flex items-center justify-center">
                            ${CaptionInput(captions[index], index, props.isEditing, 'font-handwriting text-base')}
                        </div>
                    </div>
                `).join('');

                return `
                    <div class="h-full p-6 bg-stone-50 shadow-inner flex flex-col relative overflow-hidden">
                        <div class="absolute top-0 left-0 w-32 h-32 bg-yellow-100 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
                        
                        <div class="z-10 mb-8 pl-4">
                            ${EditableText('title', props.title, null, 'text-4xl font-handwriting text-gray-800 bg-transparent border-b-2 border-transparent hover:border-stone-300 focus:border-stone-500 outline-none w-full', 'My Adventure', props.isEditing, 'font-family: \'Shadows Into Light\', cursive;')}
                        </div>

                        <div class="flex-1 relative">
                            ${scrapbookPhotos}
                        </div>
                        
                        <div class="mt-4 p-4 border-t-2 border-stone-200 border-dashed">
                            ${EditableText('text', props.text, null, 'w-full h-20 text-gray-700 bg-transparent outline-none resize-none font-handwriting text-lg', 'Notes...', props.isEditing, 'font-family: \'Shadows Into Light\', cursive;', 'textarea')}
                        </div>
                    </div>
                `;
            default:
                return `
                    <div class="flex items-center justify-center h-full text-gray-500">
                        Error: Unknown Layout Type.
                    </div>
                `;
        }
    };
    
    // Main Render Loop
    const renderApp = () => {
        const appElement = document.getElementById('app');
        if (!appElement) return;

        if (isLoading) {
            appElement.innerHTML = `
                <div class="flex flex-col items-center justify-center h-screen w-full">
                    ${IconSVG('Loader2', 48, 'animate-spin text-blue-500 mb-4')}
                    <p class="text-gray-600">Connecting to shared memories...</p>
                </div>
            `;
            return;
        }
        
        let activePage = pages[activePageIndex];
        if (!activePage) {
            pages = INITIAL_PAGES.slice();
            activePageIndex = 0;
            activePage = pages[0];
        }
        
        // Render Save Status Indicator
        let saveStatusIndicator = '';
        if (isSaving) {
            saveStatusIndicator = `
                <div class="flex items-center gap-2 text-sm font-medium px-4 py-2 bg-yellow-400 text-gray-800 rounded-md">
                    ${IconSVG('Loader2', 16, 'animate-spin')}
                    Saving...
                </div>
            `;
        } else if (saveStatus === 'success') {
            saveStatusIndicator = `
                <div class="flex items-center gap-2 text-sm font-medium px-4 py-2 bg-green-500 text-white rounded-md shadow-lg">
                    ${IconSVG('Save', 16)}
                    Saved!
                </div>
            `;
        } else if (saveStatus === 'error') {
            saveStatusIndicator = `
                <div class="flex items-center gap-2 text-sm font-medium px-4 py-2 bg-red-500 text-white rounded-md shadow-lg">
                    ${IconSVG('AlertTriangle', 16)}
                    Error!
                </div>
            `;
        } else {
             saveStatusIndicator = `
                 <button 
                    onclick="saveBook(pages)"
                    class="px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 bg-green-500 text-white hover:bg-green-600 transition-colors"
                >
                    ${IconSVG('Save', 16)}
                    Save Now
                </button>
             `;
        }

        const toolbarHtml = `
            <div class="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-20">
                <div class="flex items-center gap-4">
                    <button 
                        onclick="isEditing = !isEditing; renderApp();"
                        class="px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${
                            !isEditing 
                            ? 'bg-blue-600 text-white shadow-md' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }"
                    >
                        ${!isEditing ? IconSVG('Edit3', 16) : IconSVG('Eye', 16)}
                        ${!isEditing ? 'Edit Book' : 'Preview Mode'}
                    </button>
                    <div id="save-status-container" class="relative">${saveStatusIndicator}</div>
                </div>

                ${isEditing ? `
                    <div class="flex items-center gap-4">
                        <div class="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                            <button onclick="handleChangeLayout('hero')" class="p-2 rounded-md ${activePage.layout === 'hero' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:bg-gray-200'}" title="Hero Layout">
                                ${IconSVG('Maximize', 18)}
                            </button>
                            <button onclick="handleChangeLayout('split')" class="p-2 rounded-md ${activePage.layout === 'split' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:bg-gray-200'}" title="Split Layout">
                                ${IconSVG('Columns', 18)}
                            </button>
                            <button onclick="handleChangeLayout('grid')" class="p-2 rounded-md ${activePage.layout === 'grid' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:bg-gray-200'}" title="Grid Gallery">
                                ${IconSVG('Grid', 18)}
                            </button>
                            <button onclick="handleChangeLayout('scrapbook')" class="p-2 rounded-md ${activePage.layout === 'scrapbook' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:bg-gray-200'}" title="Scrapbook">
                                ${IconSVG('Smile', 18)}
                            </button>
                        </div>
                        <div class="w-px h-6 bg-gray-300 mx-2"></div>
                        <div class="flex gap-1">
                            <button onclick="handleMovePage('up')" ${activePageIndex === 0 ? 'disabled' : ''} class="p-2 text-gray-500 hover:bg-gray-100 rounded-md disabled:opacity-30">
                                ${IconSVG('MoveUp', 18)}
                            </button>
                            <button onclick="handleMovePage('down')" ${activePageIndex === pages.length - 1 ? 'disabled' : ''} class="p-2 text-gray-500 hover:bg-gray-100 rounded-md disabled:opacity-30">
                                ${IconSVG('MoveDown', 18)}
                            </button>
                            <button onclick="handleDeletePage()" class="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-md ml-2">
                                ${IconSVG('Trash2', 18)}
                            </button>
                        </div>
                    </div>
                ` : `
                    <span class="text-sm text-gray-500">Page ${activePageIndex + 1} of ${pages.length}</span>
                `}
            </div>
        `;

        const sidebarHtml = `
            <div class="w-64 bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ${!isEditing ? '-ml-64' : ''}">
                <div class="p-6 border-b border-gray-100">
                    <h1 class="text-xl font-serif font-bold text-gray-800 flex items-center gap-2">
                        ${IconSVG('Book', 20, 'text-blue-600')}
                        Photobook
                    </h1>
                    <p class="text-xs text-gray-400 mt-1">Memories with G (Shared)</p>
                </div>

                <div class="flex-1 overflow-y-auto p-4 space-y-3">
                    ${pages.map((page, idx) => `
                        <div 
                            onclick="activePageIndex = ${idx}; renderApp();"
                            class="p-3 rounded-lg cursor-pointer flex items-center gap-3 transition-all border ${
                                idx === activePageIndex 
                                ? 'bg-blue-50 border-blue-200 shadow-sm' 
                                : 'hover:bg-gray-50 border-transparent hover:border-gray-200'
                            }"
                        >
                            <div class="w-6 h-8 bg-gray-200 rounded border border-gray-300 flex-shrink-0 overflow-hidden">
                                <!-- Layout Miniatures -->
                                ${page.layout === 'hero' ? '<div class="w-full h-1/2 bg-gray-400"></div>' : ''}
                                ${page.layout === 'split' ? '<div class="w-1/2 h-full bg-gray-400"></div>' : ''}
                                ${page.layout === 'grid' ? '<div class="w-full h-full grid grid-cols-2 gap-[1px]"><div class="bg-gray-400"></div><div class="bg-gray-400"></div></div>' : ''}
                                ${page.layout === 'scrapbook' ? '<div class="w-full h-full flex items-center justify-center"><div class="w-3 h-3 bg-gray-400 rotate-12"></div></div>' : ''}
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium truncate ${idx === activePageIndex ? 'text-blue-800' : 'text-gray-700'}">
                                    ${page.content.title || `Page ${idx + 1}`}
                                </p>
                                <p class="text-xs text-gray-400 capitalize">${page.layout} Layout</p>
                            </div>
                        </div>
                    `).join('')}
                    
                    <button 
                        onclick="handleAddPage()"
                        class="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-400 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                    >
                        ${IconSVG('Plus', 16)} Add New Page
                    </button>
                </div>
                
                <!-- Shared Book ID/Collaboration Info -->
                <div class="p-4 border-t border-gray-100 bg-gray-50">
                    <p class="font-medium text-sm text-blue-600 mb-1 flex items-center gap-1">
                        ${IconSVG('Users', 16)} Shared Book ID
                    </p>
                    <div class="flex items-center justify-between gap-2 bg-white border border-gray-300 rounded-lg p-2">
                        <p class="text-xs text-gray-700 break-words select-all font-mono min-w-0 truncate">
                            ${appId}
                        </p>
                        <button 
                            onclick="copyAppIdToClipboard()"
                            class="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md flex-shrink-0 relative"
                            title="Copy Book ID"
                        >
                            ${IconSVG('Copy', 16)}
                             <span id="copy-message" class="absolute -top-6 right-0 bg-blue-600 text-white px-2 py-0.5 text-xs rounded opacity-0 transition-opacity">Copied!</span>
                        </button>
                    </div>
                    <p class="text-xs text-gray-500 mt-1 italic">
                        Share this entire web link for collaboration.
                    </p>
                </div>
            </div>
        `;

        const canvasHtml = `
            <div class="flex-1 flex flex-col min-w-0 bg-gray-100 relative">
                ${toolbarHtml}
                <div class="flex-1 overflow-hidden flex items-center justify-center p-8 relative">
                    <!-- Navigation Arrows -->
                    <button 
                        onclick="activePageIndex = Math.max(0, activePageIndex - 1); renderApp();"
                        ${activePageIndex === 0 ? 'disabled' : ''}
                        class="absolute left-4 z-10 p-3 bg-white/80 backdrop-blur-sm rounded-full shadow-lg text-gray-700 hover:bg-white hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all transform hover:scale-110"
                    >
                        ${IconSVG('ChevronLeft', 24)}
                    </button>
                    
                    <button 
                        onclick="activePageIndex = Math.min(pages.length - 1, activePageIndex + 1); renderApp();"
                        ${activePageIndex === pages.length - 1 ? 'disabled' : ''}
                        class="absolute right-4 z-10 p-3 bg-white/80 backdrop-blur-sm rounded-full shadow-lg text-gray-700 hover:bg-white hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all transform hover:scale-110"
                    >
                        ${IconSVG('ChevronRight', 24)}
                    </button>

                    <!-- The Page Itself -->
                    <div class="w-full max-w-4xl bg-white shadow-2xl rounded-lg overflow-hidden transition-all duration-500 ease-in-out transform photobook-page">
                        ${activePage ? renderLayout(activePage) : '<div class="flex items-center justify-center h-full text-gray-500">Select a page.</div>'}
                    </div>
                </div>
            </div>
        `;

        appElement.innerHTML = sidebarHtml + canvasHtml;
        // Re-inject the global handlers since innerHTML rebuilds them
        setupGlobalHandlers();
    };

    // --- Global Setup ---
    window.handleUpdateContent = (field, value, index) => {
        handleUpdateContent(field, value, index);
    };
    window.triggerUpload = triggerUpload;
    window.handleAddPage = handleAddPage;
    window.handleDeletePage = handleDeletePage;
    window.handleMovePage = handleMovePage;
    window.handleChangeLayout = handleChangeLayout;
    window.saveBook = saveBook;
    window.copyAppIdToClipboard = copyAppIdToClipboard;


    const setupGlobalHandlers = () => {
        // Find and attach file input dynamically
        fileInputRef = document.createElement('input');
        fileInputRef.type = 'file';
        fileInputRef.className = 'hidden';
        fileInputRef.accept = 'image/*';
        fileInputRef.onchange = handleFileChange;
        const existingInput = document.getElementById('file-input');
        if (existingInput) {
            existingInput.remove();
        }
        fileInputRef.id = 'file-input';
        document.body.appendChild(fileInputRef);
    };
    
    // Start the application
    window.onload = () => {
        setupGlobalHandlers();
        initializeFirebase();
        renderApp();
    };

</script>
</body>
</html>
