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
    const EditableText = (type, value, onChange, className, placeholder, isEditing, style = '', tag = 'input') => {
        if (isEditing) {
            const attributes = `value="${value.replace(/"/g, '&quot;')}" oninput="handleUpdateContent('${type}', this.value, ${index})" class="${className}" placeholder="${placeholder}" style="${style}"`;
            
            if (tag === 'textarea') {
                return `<textarea oninput="handleUpdateContent('${type}', this.value)" class="${className}" placeholder="${placeholder}" style="${style}">${value}</textarea>`;
            } else { // Default to input
                 return `<input type="text" oninput="handleUpdateContent('${type}', this.value)" class="${className}" placeholder="${placeholder}" style="${style}" value="${value.replace(/"/g, '&quot;')}" />`;
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
                            ${EditableText('text', props.text, null, 'w-full text-gray-600 text-center border-l-2 border-transparent hover;border-gray-300 focus:border-blue-500 outline-none bg-transparent resize-none h-24 p-2 placeholder-gray-300', 'Write about this moment...', props.isEditing, '', 'textarea')}
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
        
        const activePage = pages[activePageIndex];
        
        appElement.innerHTML = `<div class="p-8">Demo Photobook Loaded</div>`;
    };

    window.onload = () => {
        pages = INITIAL_PAGES.slice();
        isLoading = false;
        renderApp();
    };

</script>
</body>
</html>
