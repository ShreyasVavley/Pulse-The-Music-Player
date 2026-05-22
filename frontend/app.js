const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:8000' 
    : 'https://pulse-the-music-player.onrender.com';

const audioElement = document.getElementById('audio-element');
const playBtn = document.getElementById('btn-play');
const prevBtn = document.getElementById('btn-prev');
const nextBtn = document.getElementById('btn-next');
const muteBtn = document.getElementById('btn-mute');
const seekSlider = document.getElementById('seek-slider');
const volumeSlider = document.getElementById('volume-slider');
const timeCurrent = document.getElementById('time-current');
const timeTotal = document.getElementById('time-total');
const trackTableBody = document.getElementById('track-table-body');

const npCover = document.getElementById('np-cover');
const npTitle = document.getElementById('np-title');
const npArtist = document.getElementById('np-artist');
const heroCover = document.getElementById('hero-cover');
const heroTitle = document.getElementById('hero-title');
const heroDesc = document.getElementById('hero-desc');

let playlist = [];
let currentTrackIndex = 0;
let isPlaying = false;
let audioContext;
let analyser;
let gainNode;
let source;
let audioInitialized = false;
let eqFilters = [];
const EQ_FREQS = [60, 230, 910, 4000, 14000];
let likedTracks = JSON.parse(localStorage.getItem('pulse_liked_tracks') || '[]');
let isShowingLiked = false;

// --- Sound Lab State and DSP Nodes ---
let is8DActive = false;
let isLofiActive = false;
let isKaraokeActive = false;
let panAngle = 0;
let tubeDrive = 1.0;

let pannerNode = null;
let reverbDelayNode = null;
let reverbFeedbackNode = null;
let reverbWetGain = null;
let tapeDelayNode = null;
let tapeLfoOsc = null;
let tapeLfoGain = null;
let lofiFilterNode1 = null;
let lofiFilterNode2 = null;
let vinylCrackleSource = null;
let vinylCrackleGain = null;
let vocalFilterNode1 = null;
let vocalFilterNode2 = null;
let tubeShaperNode = null;

function makeDistortionCurve(drive) {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const denom = Math.tanh(drive);
    for (let i = 0; i < n_samples; ++i) {
        const x = (i * 2) / n_samples - 1;
        // sigmoidal soft-clipping function modeling dynamic tube saturation
        curve[i] = Math.tanh(x * drive) / denom;
    }
    return curve;
}

function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function updateSliderBackground(slider) {
    const value = (slider.value - slider.min) / (slider.max - slider.min) * 100;
    slider.style.background = `linear-gradient(to right, var(--accent) ${value}%, #333 ${value}%)`;
}

function generateDynamicCover(seedText) {
    if (!seedText) seedText = "Unknown";
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    
    let hash = 0;
    for (let i = 0; i < seedText.length; i++) {
        hash = seedText.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const hue1 = 45; // Gold hue
    const sat1 = 60 + (Math.abs(hash % 40)); // 60-100% saturation
    const light1 = 10 + (Math.abs(hash % 20)); // 10-30% lightness (dark gold)
    
    const light2 = 2 + (Math.abs((hash >> 2) % 8)); // 2-10% lightness (near black)
    
    const gradient = ctx.createLinearGradient(0, 0, 300, 300);
    gradient.addColorStop(0, `hsl(${hue1}, ${sat1}%, ${light1}%)`);
    gradient.addColorStop(1, `hsl(${hue1}, 20%, ${light2}%)`);
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 300, 300);
    
    ctx.fillStyle = `hsla(${hue1}, ${sat1}%, 60%, 0.1)`;
    ctx.beginPath();
    ctx.arc(150 + (hash % 50), 150 + ((hash >> 2) % 50), 120, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 120px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(seedText.charAt(0).toUpperCase(), 150, 160);
    
    return canvas.toDataURL();
}

async function fetchSongs() {
    try {
        trackTableBody.innerHTML = '<tr><td colspan="4" id="status-message">Loading tracks...</td></tr>';
        const response = await fetch(`${API_BASE_URL}/songs`);
        if (!response.ok) throw new Error('Failed to fetch songs');
        
        playlist = await response.json();
        
        if (playlist.length === 0) {
            trackTableBody.innerHTML = '<tr><td colspan="4" id="status-message">No tracks found. Run populate_db.py!</td></tr>';
            return;
        }
        
        const savedVolume = localStorage.getItem('pulse_volume');
        if (savedVolume !== null) {
            volumeSlider.value = savedVolume;
            updateSliderBackground(volumeSlider);
            audioElement.volume = savedVolume;
        }
        
        const savedTrackId = localStorage.getItem('pulse_last_track_id');
        let initialIndex = 0;
        if (savedTrackId) {
            const index = playlist.findIndex(t => t.id == savedTrackId);
            if (index !== -1) initialIndex = index;
        }
        
        renderTrackList();
        renderPlaylists();
        loadTrack(initialIndex, false);
        
    } catch (error) {
        console.error("Error fetching songs:", error);
        trackTableBody.innerHTML = `<tr><td colspan="4" id="status-message">Error connecting to server. Is FastAPI running?</td></tr>`;
    }
}

function renderTrackList(tracks = playlist) {
    trackTableBody.innerHTML = '';
    
    if (tracks.length === 0 && playlist.length > 0) {
        trackTableBody.innerHTML = '<tr><td colspan="4" id="status-message">No matches found.</td></tr>';
        return;
    }
    
    tracks.forEach((track, idx) => {
        const actualIndex = playlist.findIndex(t => t.id === track.id);
        const tr = document.createElement('tr');
        // Stagger the animation by 30ms per row
        tr.style.animationDelay = `${idx * 0.03}s`;
        if (actualIndex === currentTrackIndex) tr.classList.add('active-track');
        tr.innerHTML = `
            <td>${actualIndex + 1}</td>
            <td>
                <div class="track-title-cell">
                    <img src="${track.cover_url || generateDynamicCover(track.album || track.title)}" alt="cover" class="track-list-cover">
                    <div class="track-title-info">
                        <div class="title">${track.title}</div>
                        <div class="artist">${track.artist}</div>
                    </div>
                </div>
            </td>
            <td>${track.album || 'Unknown Album'}</td>
            <td>${track.duration}</td>
        `;
        tr.addEventListener('click', () => {
            loadTrack(actualIndex, true);
        });
        trackTableBody.appendChild(tr);
    });
}

function renderPlaylists() {
    const playlistList = document.getElementById('playlist-list');
    playlistList.innerHTML = '';
    
    const albums = [...new Set(playlist.map(t => t.album))].filter(a => a);
    
    if (albums.length === 0) {
        playlistList.innerHTML = '<li>No Playlists Found</li>';
        return;
    }
    
    albums.forEach(album => {
        const li = document.createElement('li');
        li.textContent = album;
        li.addEventListener('click', (e) => {
            const navLinks = document.querySelectorAll('.nav-links a');
            const searchContainer = document.getElementById('search-container');
            const searchInput = document.getElementById('search-input');
            
            navLinks.forEach(l => l.classList.remove('active'));
            document.querySelectorAll('#playlist-list li').forEach(l => l.classList.remove('active'));
            e.target.classList.add('active');
            
            searchContainer.classList.add('hidden');
            searchInput.value = '';
            
            const filtered = playlist.filter(t => t.album === album);
            renderTrackList(filtered);
            
            heroTitle.textContent = album;
            heroDesc.textContent = `Album Playlist • ${filtered.length} songs`;
        });
        playlistList.appendChild(li);
    });
}

function initAudio() {
    if (audioInitialized) return;
    
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContext();
    
    analyser = audioContext.createAnalyser();
    gainNode = audioContext.createGain();
    
    analyser.fftSize = 256;
    
    source = audioContext.createMediaElementSource(audioElement);
    
    // Connect EQ filters in series
    let lastNode = source;
    eqFilters = [];
    EQ_FREQS.forEach((freq, idx) => {
        const filter = audioContext.createBiquadFilter();
        if (idx === 0) {
            filter.type = 'lowshelf';
        } else if (idx === EQ_FREQS.length - 1) {
            filter.type = 'highshelf';
        } else {
            filter.type = 'peaking';
            filter.Q.value = 1.0;
        }
        filter.frequency.value = freq;
        const sliderEl = document.getElementById(`eq-band-${idx}`);
        filter.gain.value = sliderEl ? parseFloat(sliderEl.value) : 0;
        
        lastNode.connect(filter);
        lastNode = filter;
        eqFilters.push(filter);
    });
    
    // Connect Karaoke Vocal Cut Filters
    vocalFilterNode1 = audioContext.createBiquadFilter();
    vocalFilterNode1.type = 'peaking';
    vocalFilterNode1.frequency.value = 1200;
    vocalFilterNode1.Q.value = 0.8;
    vocalFilterNode1.gain.value = isKaraokeActive ? -16 : 0;
    
    vocalFilterNode2 = audioContext.createBiquadFilter();
    vocalFilterNode2.type = 'peaking';
    vocalFilterNode2.frequency.value = 2500;
    vocalFilterNode2.Q.value = 0.8;
    vocalFilterNode2.gain.value = isKaraokeActive ? -16 : 0;
    
    lastNode.connect(vocalFilterNode1);
    vocalFilterNode1.connect(vocalFilterNode2);
    lastNode = vocalFilterNode2;
    
    // Connect WaveShaper Warm Tube Saturation
    tubeShaperNode = audioContext.createWaveShaper();
    const tubeSlider = document.getElementById('slider-tube');
    const tubeVal = tubeSlider ? parseFloat(tubeSlider.value) : 100;
    tubeDrive = tubeVal / 100; // Map 100-500 to 1.0-5.0
    tubeShaperNode.curve = makeDistortionCurve(tubeDrive);
    tubeShaperNode.oversample = '4x';
    
    lastNode.connect(tubeShaperNode);
    lastNode = tubeShaperNode;
    
    // Connect Lofi Warm Filters
    lofiFilterNode1 = audioContext.createBiquadFilter();
    lofiFilterNode1.type = 'peaking';
    lofiFilterNode1.frequency.value = 400;
    lofiFilterNode1.Q.value = 0.5;
    lofiFilterNode1.gain.value = isLofiActive ? 4 : 0;
    
    lofiFilterNode2 = audioContext.createBiquadFilter();
    lofiFilterNode2.type = 'lowpass';
    lofiFilterNode2.frequency.value = isLofiActive ? 3200 : 22000;
    
    lastNode.connect(lofiFilterNode1);
    lofiFilterNode1.connect(lofiFilterNode2);
    lastNode = lofiFilterNode2;
    
    // Connect Tape Delay (Wow & Flutter)
    tapeDelayNode = audioContext.createDelay();
    tapeDelayNode.delayTime.value = 0.005;
    
    tapeLfoOsc = audioContext.createOscillator();
    tapeLfoGain = audioContext.createGain();
    tapeLfoOsc.frequency.value = 1.2;
    tapeLfoGain.gain.value = isLofiActive ? 0.0018 : 0.0;
    
    tapeLfoOsc.connect(tapeLfoGain);
    tapeLfoGain.connect(tapeDelayNode.delayTime);
    tapeLfoOsc.start();
    
    lastNode.connect(tapeDelayNode);
    lastNode = tapeDelayNode;
    
    // Connect Concert Reverb (Parallel delay line)
    reverbDelayNode = audioContext.createDelay();
    reverbDelayNode.delayTime.value = 0.18;
    reverbFeedbackNode = audioContext.createGain();
    reverbFeedbackNode.gain.value = 0.45;
    reverbWetGain = audioContext.createGain();
    
    const reverbSlider = document.getElementById('slider-reverb');
    const reverbVal = reverbSlider ? parseFloat(reverbSlider.value) : 0;
    reverbWetGain.gain.value = isNaN(reverbVal) ? 0 : reverbVal / 150;
    
    reverbDelayNode.connect(reverbFeedbackNode);
    reverbFeedbackNode.connect(reverbDelayNode);
    
    lastNode.connect(reverbDelayNode);
    
    // Create Panner
    pannerNode = audioContext.createStereoPanner ? audioContext.createStereoPanner() : null;
    
    if (pannerNode) {
        lastNode.connect(pannerNode);
        reverbDelayNode.connect(reverbWetGain);
        reverbWetGain.connect(pannerNode);
        lastNode = pannerNode;
    } else {
        reverbDelayNode.connect(reverbWetGain);
        reverbWetGain.connect(analyser); // fallback
    }
    
    lastNode.connect(analyser);
    analyser.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    audioInitialized = true;
    gainNode.gain.value = volumeSlider.value;
    
    // Procedural Vinyl crackle
    initVinylCrackle();
    
    if (window.initVisualizer) {
        window.initVisualizer(analyser);
    }
}

function initVinylCrackle() {
    if (!audioContext) return;
    
    const bufferSize = audioContext.sampleRate * 2.0;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
        const rand = Math.random();
        if (rand > 0.9997) {
            data[i] = (Math.random() * 2 - 1) * 0.28;
        } else if (rand > 0.994) {
            data[i] = (Math.random() * 2 - 1) * 0.035;
        } else {
            data[i] = (Math.random() * 2 - 1) * 0.0015;
        }
    }
    
    vinylCrackleSource = audioContext.createBufferSource();
    vinylCrackleSource.buffer = buffer;
    vinylCrackleSource.loop = true;
    
    vinylCrackleGain = audioContext.createGain();
    vinylCrackleGain.gain.value = isLofiActive ? 0.08 : 0.0;
    
    vinylCrackleSource.connect(vinylCrackleGain);
    vinylCrackleGain.connect(audioContext.destination);
    vinylCrackleSource.start();
}

function loadTrack(index, playOnLoad = true) {
    if (playlist.length === 0) return;
    
    currentTrackIndex = index;
    const track = playlist[index];
    
    localStorage.setItem('pulse_last_track_id', track.id);
    
    audioElement.src = `${API_BASE_URL}/stream/${track.id}`;
    audioElement.load();
    
    const generatedCover = generateDynamicCover(track.album || track.title);
    npCover.src = track.cover_url || generatedCover;
    npTitle.textContent = track.title;
    npArtist.textContent = track.artist;
    
    // Update like button state
    if (likeBtn) {
        const isLiked = likedTracks.includes(track.id);
        if (isLiked) {
            likeBtn.classList.add('liked');
            likeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="currentColor" stroke-linejoin="round" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>';
        } else {
            likeBtn.classList.remove('liked');
            likeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>';
        }
    }
    
    if (isShowingLiked) {
        heroCover.src = generateLikedCover();
        heroTitle.textContent = "Liked Songs";
        const filteredCount = playlist.filter(t => likedTracks.includes(t.id)).length;
        heroDesc.textContent = `Your favorite tracks • ${filteredCount} song${filteredCount === 1 ? '' : 's'}`;
    } else {
        heroCover.src = track.cover_url || generatedCover;
        heroTitle.textContent = track.title;
        heroDesc.textContent = `${track.artist} • ${track.album}`;
    }
    
    if (isShowingLiked) {
        const filtered = playlist.filter(t => likedTracks.includes(t.id));
        renderTrackList(filtered);
    } else {
        renderTrackList();
    }
    renderQueue();
    
    // WOW FACTOR: Sync theme colors with track
    updateThemeColors(track.album || track.title);
    
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.artist,
            album: track.album || 'Pulse Library',
            artwork: [
                { src: track.cover_url || generatedCover, sizes: '300x300', type: 'image/jpeg' }
            ]
        });
    }
    
    if (playOnLoad) {
        playAudio();
    } else {
        pauseAudio();
    }
}

function playAudio() {
    if (!audioInitialized) initAudio();
    if (audioContext.state === 'suspended') audioContext.resume();
    
    document.querySelector('.player-bar').classList.add('active');
    document.querySelector('.app-container').classList.add('player-active');
    
    // Preserve custom playback speeds on track loading
    const speedSlider = document.getElementById('slider-speed');
    const speedVal = speedSlider ? parseFloat(speedSlider.value) / 100 : 1.0;
    audioElement.playbackRate = speedVal;
    
    const playPromise = audioElement.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            // Re-apply playback rate just in case browser resets on loaded metadata
            audioElement.playbackRate = speedVal;
            isPlaying = true;
            document.getElementById('hero-cover').classList.add('playing');
            document.getElementById('np-cover').classList.add('spinning');
            document.getElementById('mini-eq').classList.add('playing');
            updatePlayButton();
        }).catch(err => {
            console.error("Playback prevented:", err);
            isPlaying = false;
            document.getElementById('hero-cover').classList.remove('playing');
            document.getElementById('np-cover').classList.remove('spinning');
            document.getElementById('mini-eq').classList.remove('playing');
            updatePlayButton();
        });
    }
}

function pauseAudio() {
    audioElement.pause();
    isPlaying = false;
    document.getElementById('hero-cover').classList.remove('playing');
    document.getElementById('np-cover').classList.remove('spinning');
    document.getElementById('mini-eq').classList.remove('playing');
    updatePlayButton();
}

function togglePlay() {
    if (playlist.length === 0) return;
    if (isPlaying) pauseAudio();
    else playAudio();
}

function updatePlayButton() {
    if (isPlaying) {
        playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
    } else {
        playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    }
}

playBtn.addEventListener('click', togglePlay);

prevBtn.addEventListener('click', () => {
    let newIndex = currentTrackIndex - 1;
    if (newIndex < 0) newIndex = playlist.length - 1;
    loadTrack(newIndex, true);
});

nextBtn.addEventListener('click', () => {
    let newIndex = currentTrackIndex + 1;
    if (newIndex >= playlist.length) newIndex = 0;
    loadTrack(newIndex, true);
});

audioElement.addEventListener('ended', () => {
    nextBtn.click();
});

audioElement.addEventListener('waiting', () => {
    npTitle.classList.add('buffering');
});
audioElement.addEventListener('playing', () => {
    npTitle.classList.remove('buffering');
});
audioElement.addEventListener('error', (e) => {
    console.error("Audio streaming error:", e);
    npTitle.textContent = "Error loading stream";
    npTitle.classList.remove('buffering');
});

audioElement.addEventListener('timeupdate', () => {
    if (!seekSlider.dragging) {
        const percent = (audioElement.currentTime / audioElement.duration) * 100;
        seekSlider.value = isNaN(percent) ? 0 : percent;
        updateSliderBackground(seekSlider);
    }
    timeCurrent.textContent = formatTime(audioElement.currentTime);
    timeTotal.textContent = formatTime(audioElement.duration);
});

audioElement.addEventListener('loadedmetadata', () => {
    timeTotal.textContent = formatTime(audioElement.duration);
});

seekSlider.addEventListener('input', () => {
    seekSlider.dragging = true;
    updateSliderBackground(seekSlider);
});

seekSlider.addEventListener('change', () => {
    if (!isNaN(audioElement.duration)) {
        const time = (seekSlider.value / 100) * audioElement.duration;
        audioElement.currentTime = time;
    }
    seekSlider.dragging = false;
});

volumeSlider.addEventListener('input', () => {
    const value = volumeSlider.value;
    audioElement.volume = value;
    if (gainNode) gainNode.gain.value = value;
    updateSliderBackground(volumeSlider);
    
    localStorage.setItem('pulse_volume', value);
    
    if (value === '0') {
        muteBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';
    } else {
        muteBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
    }
});

let isMuted = false;
let previousVolume = 1;
muteBtn.addEventListener('click', () => {
    if (isMuted) {
        volumeSlider.value = previousVolume;
        isMuted = false;
    } else {
        previousVolume = volumeSlider.value;
        volumeSlider.value = 0;
        isMuted = true;
    }
    volumeSlider.dispatchEvent(new Event('input'));
});

updateSliderBackground(seekSlider);
updateSliderBackground(volumeSlider);

fetchSongs();

const uploadBtn = document.getElementById('btn-upload');
const fileUpload = document.getElementById('file-upload');

if (uploadBtn && fileUpload) {
    uploadBtn.addEventListener('click', () => {
        fileUpload.click();
    });

    fileUpload.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (files.length === 0) return;
        
        heroTitle.textContent = "Uploading...";
        heroDesc.textContent = `Processing ${files.length} track(s)`;
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const formData = new FormData();
            formData.append("file", file);
            
            try {
                await fetch(`${API_BASE_URL}/upload`, {
                    method: "POST",
                    body: formData
                });
            } catch (err) {
                console.error("Upload failed for", file.name, err);
            }
        }
        
        fileUpload.value = ''; // Reset
        await fetchSongs();
        heroTitle.textContent = "Library Updated";
        heroDesc.textContent = "Your local tracks have been added.";
    });
}

const syncBtn = document.getElementById('btn-sync');
const syncPath = document.getElementById('sync-path');

if (syncBtn && syncPath) {
    syncBtn.addEventListener('click', async () => {
        const path = syncPath.value.trim();
        if (!path) {
            alert("Please enter a folder path to scan (e.g., C:\\Users\\Hi\\Music).");
            return;
        }
        
        syncBtn.classList.add('spinning');
        heroTitle.textContent = "Scanning...";
        heroDesc.textContent = `Looking for audio files in ${path}`;
        
        try {
            const response = await fetch(`${API_BASE_URL}/scan`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ folder_path: path })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                heroTitle.textContent = "Scan Complete";
                heroDesc.textContent = data.message;
                await fetchSongs();
                syncPath.value = '';
            } else {
                heroTitle.textContent = "Scan Failed";
                heroDesc.textContent = data.detail || "Error scanning directory.";
            }
        } catch (err) {
            console.error("Scan failed:", err);
            heroTitle.textContent = "Scan Error";
            heroDesc.textContent = "Could not connect to server to scan.";
        } finally {
            syncBtn.classList.remove('spinning');
        }
    });
}

// --- Sidebar Interactivity ---
const navLinks = document.querySelectorAll('.nav-links a');
const searchContainer = document.getElementById('search-container');
const searchInput = document.getElementById('search-input');

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        navLinks.forEach(l => l.classList.remove('active'));
        document.querySelectorAll('#playlist-list li').forEach(l => l.classList.remove('active'));
        
        const targetLink = e.currentTarget;
        targetLink.classList.add('active');
        
        const text = targetLink.textContent.trim();
        const isSearch = text.includes('Search');
        const isLiked = text.includes('Liked Songs');
        
        if (isSearch) {
            isShowingLiked = false;
            searchContainer.classList.remove('hidden');
            searchInput.focus();
            heroTitle.textContent = "Search";
            heroDesc.textContent = "Find your favorite tracks";
        } else if (isLiked) {
            isShowingLiked = true;
            searchContainer.classList.add('hidden');
            searchInput.value = '';
            
            const filtered = playlist.filter(t => likedTracks.includes(t.id));
            renderTrackList(filtered);
            
            heroCover.src = generateLikedCover();
            heroTitle.textContent = "Liked Songs";
            heroDesc.textContent = `Your favorite tracks • ${filtered.length} song${filtered.length === 1 ? '' : 's'}`;
            
            // Sync theme colors with a premium deep-red HSL hue
            document.documentElement.style.setProperty('--accent-dynamic', `hsl(350, 60%, 45%)`);
            document.documentElement.style.setProperty('--accent-glow', `hsla(350, 60%, 45%, 0.35)`);
        } else {
            isShowingLiked = false;
            searchContainer.classList.add('hidden');
            searchInput.value = '';
            renderTrackList();
            heroTitle.textContent = text;
            heroDesc.textContent = "Browsing • " + text;
        }
    });
});

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = playlist.filter(track => 
            track.title.toLowerCase().includes(query) || 
            track.artist.toLowerCase().includes(query) ||
            track.album.toLowerCase().includes(query)
        );
        renderTrackList(filtered);
    });
}

// --- Keyboard & Media Controls ---
document.addEventListener('keydown', (e) => {
    // Prevent shortcuts if user is typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    const code = e.code;
    const key = e.key.toLowerCase();

    if (code === 'Space') {
        e.preventDefault();
        togglePlay();
    } else if (code === 'ArrowRight') {
        e.preventDefault();
        nextBtn.click();
    } else if (code === 'ArrowLeft') {
        e.preventDefault();
        prevBtn.click();
    } else if (key === 'm') {
        muteBtn.click();
    } else if (key === 'l') {
        if (likeBtn) likeBtn.click();
    }
});

if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', playAudio);
    navigator.mediaSession.setActionHandler('pause', pauseAudio);
    navigator.mediaSession.setActionHandler('previoustrack', () => prevBtn.click());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextBtn.click());
}

// --- Like Button Logic ---
const likeBtn = document.getElementById('btn-like');
if (likeBtn) {
    likeBtn.addEventListener('click', () => {
        if (playlist.length === 0) return;
        const currentTrack = playlist[currentTrackIndex];
        const trackId = currentTrack.id;
        
        const idx = likedTracks.indexOf(trackId);
        if (idx === -1) {
            likedTracks.push(trackId);
            likeBtn.classList.add('liked');
            likeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="currentColor" stroke-linejoin="round" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>';
        } else {
            likedTracks.splice(idx, 1);
            likeBtn.classList.remove('liked');
            likeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>';
        }
        
        localStorage.setItem('pulse_liked_tracks', JSON.stringify(likedTracks));
        
        // If currently viewing liked songs, refresh list
        if (isShowingLiked) {
            const filtered = playlist.filter(t => likedTracks.includes(t.id));
            renderTrackList(filtered);
            heroDesc.textContent = `Your favorite tracks • ${filtered.length} song${filtered.length === 1 ? '' : 's'}`;
        }
    });
}

// --- Queue Logic ---
const btnQueue = document.getElementById('btn-queue');
const btnCloseQueue = document.getElementById('btn-close-queue');
const queuePanel = document.getElementById('queue-panel');
const queueListEl = document.getElementById('queue-list');

if (btnQueue && btnCloseQueue && queuePanel) {
    btnQueue.addEventListener('click', () => queuePanel.classList.add('open'));
    btnCloseQueue.addEventListener('click', () => queuePanel.classList.remove('open'));
}
function renderQueue() {
    if (!queueListEl) return;
    queueListEl.innerHTML = '';
    
    // Show next 10 tracks
    let queueItems = [];
    for (let i = 1; i <= 10; i++) {
        let qIndex = currentTrackIndex + i;
        if (qIndex >= playlist.length) break;
        queueItems.push({ track: playlist[qIndex], index: qIndex });
    }
    
    if (queueItems.length === 0) {
        queueListEl.innerHTML = '<li style="color: var(--text-subdued); justify-content: center; padding: 20px;">No upcoming tracks</li>';
        return;
    }
    
    queueItems.forEach(item => {
        const li = document.createElement('li');
        const generatedCover = generateDynamicCover(item.track.album || item.track.title);
        li.innerHTML = `
            <img src="${item.track.cover_url || generatedCover}" class="queue-item-cover" alt="cover">
            <div class="queue-item-info">
                <span class="queue-item-title">${item.track.title}</span>
                <span class="queue-item-artist">${item.track.artist}</span>
            </div>
        `;
        li.addEventListener('click', () => loadTrack(item.index, true));
        queueListEl.appendChild(li);
    });
}

function updateThemeColors(seedText) {
    let hash = 0;
    for (let i = 0; i < seedText.length; i++) {
        hash = seedText.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    // Use the color for the aurora orbs
    document.documentElement.style.setProperty('--accent-dynamic', `hsl(${hue}, 60%, 50%)`);
    document.documentElement.style.setProperty('--accent-glow', `hsla(${hue}, 60%, 50%, 0.3)`);
}

// WOW FACTOR: Mouse Parallax
document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 20;
    const y = (e.clientY / window.innerHeight - 0.5) * 20;
    
    const panels = document.querySelectorAll('.sidebar, .main-view, .player-bar');
    panels.forEach(panel => {
        panel.style.transform = `perspective(1000px) rotateY(${x}deg) rotateX(${-y}deg) translateY(${panel.classList.contains('player-bar') ? (panel.classList.contains('active') ? '0' : '150%') : '0'})`;
    });
});

function generateLikedCover() {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    
    const gradient = ctx.createLinearGradient(0, 0, 300, 300);
    gradient.addColorStop(0, '#3a0d10');
    gradient.addColorStop(1, '#0c0203');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 300, 300);
    
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(150, 150, 110, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.fillStyle = '#ff3b30';
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(255, 59, 48, 0.6)';
    ctx.font = 'bold 100px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('❤', 150, 150);
    
    return canvas.toDataURL();
}

// --- Equalizer Logic ---
const btnEq = document.getElementById('btn-eq');
const btnCloseEq = document.getElementById('btn-close-eq');
const eqPanel = document.getElementById('eq-panel');
const eqPresetSelect = document.getElementById('eq-preset');

if (btnEq && btnCloseEq && eqPanel) {
    btnEq.addEventListener('click', () => {
        eqPanel.classList.add('open');
        if (queuePanel) queuePanel.classList.remove('open');
        if (studioPanel) {
            studioPanel.classList.remove('open');
            if (btnStudio) btnStudio.classList.remove('active');
        }
    });
    btnCloseEq.addEventListener('click', () => eqPanel.classList.remove('open'));
}

const EQ_PRESETS = {
    flat: [0, 0, 0, 0, 0],
    bass: [8, 4, 0, 0, -2],
    vocal: [-2, 1, 5, 3, -1],
    electronic: [6, 2, -1, 3, 5],
    acoustic: [2, 3, 1, 2, 4],
    lounge: [5, 2, -2, 1, -3]
};

function updateEqFilter(idx, value) {
    const dbValue = parseFloat(value);
    const valueEl = document.getElementById(`eq-value-${idx}`);
    if (valueEl) {
        valueEl.textContent = `${dbValue > 0 ? '+' : ''}${dbValue}dB`;
    }
    if (audioInitialized && eqFilters[idx]) {
        eqFilters[idx].gain.value = dbValue;
    }
}

for (let i = 0; i < 5; i++) {
    const slider = document.getElementById(`eq-band-${i}`);
    if (slider) {
        slider.addEventListener('input', (e) => {
            updateEqFilter(i, e.target.value);
            if (eqPresetSelect) eqPresetSelect.value = 'custom';
        });
    }
}

if (eqPresetSelect) {
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = 'Custom';
    customOpt.style.display = 'none';
    eqPresetSelect.appendChild(customOpt);

    eqPresetSelect.addEventListener('change', (e) => {
        const preset = e.target.value;
        if (preset === 'custom') return;
        const gains = EQ_PRESETS[preset];
        if (gains) {
            gains.forEach((gain, idx) => {
                const slider = document.getElementById(`eq-band-${idx}`);
                if (slider) {
                    slider.value = gain;
                    updateEqFilter(idx, gain);
                }
            });
        }
    });
}

// --- Sound Lab & Visual Engine Logic ---
const btnStudio = document.getElementById('btn-studio');
const btnCloseStudio = document.getElementById('btn-close-studio');
const studioPanel = document.getElementById('studio-panel');
const toggleKaraoke = document.getElementById('toggle-karaoke');
const toggle8D = document.getElementById('toggle-8d');
const sliderReverb = document.getElementById('slider-reverb');
const reverbValueDisp = document.getElementById('reverb-value');
const toggleLofi = document.getElementById('toggle-lofi');
const visualizerThemeSelect = document.getElementById('visualizer-theme');

if (btnStudio && btnCloseStudio && studioPanel) {
    btnStudio.addEventListener('click', () => {
        studioPanel.classList.add('open');
        btnStudio.classList.add('active');
        if (eqPanel) eqPanel.classList.remove('open');
        if (queuePanel) queuePanel.classList.remove('open');
    });
    btnCloseStudio.addEventListener('click', () => {
        studioPanel.classList.remove('open');
        btnStudio.classList.remove('active');
    });
}

// Update other drawers to close Studio
if (btnQueue && btnCloseQueue && queuePanel) {
    btnQueue.addEventListener('click', () => {
        queuePanel.classList.add('open');
        if (eqPanel) eqPanel.classList.remove('open');
        if (studioPanel) {
            studioPanel.classList.remove('open');
            if (btnStudio) btnStudio.classList.remove('active');
        }
    });
    btnCloseQueue.addEventListener('click', () => queuePanel.classList.remove('open'));
}

// Karaoke logic
if (toggleKaraoke) {
    toggleKaraoke.addEventListener('change', (e) => {
        isKaraokeActive = e.target.checked;
        if (audioInitialized && vocalFilterNode1 && vocalFilterNode2) {
            const targetGain = isKaraokeActive ? -16 : 0;
            vocalFilterNode1.gain.linearRampToValueAtTime(targetGain, audioContext.currentTime + 0.4);
            vocalFilterNode2.gain.linearRampToValueAtTime(targetGain, audioContext.currentTime + 0.4);
        }
    });
}

// 8D Headphone simulation
if (toggle8D) {
    toggle8D.addEventListener('change', (e) => {
        is8DActive = e.target.checked;
        if (is8DActive) {
            if (!audioInitialized) initAudio();
            run8DPanning();
        } else {
            if (audioInitialized && pannerNode) {
                pannerNode.pan.linearRampToValueAtTime(0, audioContext.currentTime + 0.3);
            }
        }
    });
}

function run8DPanning() {
    if (!is8DActive || !pannerNode) return;
    panAngle += 0.015;
    pannerNode.pan.value = Math.sin(panAngle) * 0.8;
    requestAnimationFrame(run8DPanning);
}

// Reverb hall logic
if (sliderReverb && reverbValueDisp) {
    sliderReverb.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (val === 0) {
            reverbValueDisp.textContent = 'Off';
        } else {
            reverbValueDisp.textContent = `${val}%`;
        }
        
        if (audioInitialized && reverbWetGain) {
            reverbWetGain.gain.linearRampToValueAtTime(val / 150, audioContext.currentTime + 0.1);
        }
    });
}

// Lofi Vinyl & Tape Logic
if (toggleLofi) {
    toggleLofi.addEventListener('change', (e) => {
        isLofiActive = e.target.checked;
        if (isLofiActive) {
            if (!audioInitialized) initAudio();
            if (lofiFilterNode1 && lofiFilterNode2 && tapeLfoGain && vinylCrackleGain) {
                lofiFilterNode1.gain.linearRampToValueAtTime(4, audioContext.currentTime + 0.3);
                lofiFilterNode2.frequency.exponentialRampToValueAtTime(3200, audioContext.currentTime + 0.3);
                tapeLfoGain.gain.linearRampToValueAtTime(0.0018, audioContext.currentTime + 0.5);
                vinylCrackleGain.gain.linearRampToValueAtTime(0.08, audioContext.currentTime + 0.4);
            }
        } else {
            if (audioInitialized && lofiFilterNode1 && lofiFilterNode2 && tapeLfoGain && vinylCrackleGain) {
                lofiFilterNode1.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.3);
                lofiFilterNode2.frequency.exponentialRampToValueAtTime(22000, audioContext.currentTime + 0.3);
                tapeLfoGain.gain.linearRampToValueAtTime(0.0, audioContext.currentTime + 0.3);
                vinylCrackleGain.gain.linearRampToValueAtTime(0.0, audioContext.currentTime + 0.4);
            }
        }
    });
}

// Visual theme choice
if (visualizerThemeSelect) {
    window.visualizerTheme = visualizerThemeSelect.value;
    visualizerThemeSelect.addEventListener('change', (e) => {
        window.visualizerTheme = e.target.value;
    });
}

// --- Warm Tube Saturation Slider ---
const sliderTube = document.getElementById('slider-tube');
const tubeValueDisp = document.getElementById('tube-value');

if (sliderTube && tubeValueDisp) {
    sliderTube.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (val === 100) {
            tubeValueDisp.textContent = 'Clean';
        } else {
            tubeValueDisp.textContent = `${(val / 100).toFixed(1)}x`;
        }
        
        tubeDrive = val / 100;
        if (audioInitialized && tubeShaperNode) {
            // Apply new distortion curve to modeled tube shaper
            tubeShaperNode.curve = makeDistortionCurve(tubeDrive);
        }
    });
}

// --- Speed & Playback Tempo Lab ---
const sliderSpeed = document.getElementById('slider-speed');
const speedValueDisp = document.getElementById('speed-value');
const btnPresetSlow = document.getElementById('btn-preset-slow');
const btnPresetNormal = document.getElementById('btn-preset-normal');
const btnPresetNightcore = document.getElementById('btn-preset-nightcore');

function updateSpeed(val) {
    if (speedValueDisp) speedValueDisp.textContent = `${val.toFixed(2)}x`;
    audioElement.playbackRate = val;
    if (sliderSpeed) {
        sliderSpeed.value = Math.round(val * 100);
        updateSliderBackground(sliderSpeed);
    }
}

if (sliderSpeed) {
    sliderSpeed.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) / 100;
        updateSpeed(val);
        
        // Clear active states on presets when manually sliding
        [btnPresetSlow, btnPresetNormal, btnPresetNightcore].forEach(b => {
            if (b) b.classList.remove('active');
        });
    });
}

function setActiveSpeedPreset(activeBtn) {
    [btnPresetSlow, btnPresetNormal, btnPresetNightcore].forEach(b => {
        if (b) b.classList.remove('active');
    });
    if (activeBtn) activeBtn.classList.add('active');
}

if (btnPresetSlow) {
    btnPresetSlow.addEventListener('click', () => {
        if (!audioInitialized) initAudio();
        setActiveSpeedPreset(btnPresetSlow);
        updateSpeed(0.75);
        
        // Slowed & Reverb: automatically apply Reverb & Lofi Analog
        if (toggleLofi && !toggleLofi.checked) {
            toggleLofi.checked = true;
            toggleLofi.dispatchEvent(new Event('change'));
        }
        if (sliderReverb) {
            sliderReverb.value = 60;
            sliderReverb.dispatchEvent(new Event('input'));
        }
    });
}

if (btnPresetNormal) {
    btnPresetNormal.addEventListener('click', () => {
        setActiveSpeedPreset(btnPresetNormal);
        updateSpeed(1.0);
        
        // Reset all effects to clean
        if (toggleLofi && toggleLofi.checked) {
            toggleLofi.checked = false;
            toggleLofi.dispatchEvent(new Event('change'));
        }
        if (sliderReverb) {
            sliderReverb.value = 0;
            sliderReverb.dispatchEvent(new Event('input'));
        }
        if (sliderTube) {
            sliderTube.value = 100;
            sliderTube.dispatchEvent(new Event('input'));
        }
        if (eqPresetSelect) {
            eqPresetSelect.value = 'flat';
            eqPresetSelect.dispatchEvent(new Event('change'));
        }
    });
}

if (btnPresetNightcore) {
    btnPresetNightcore.addEventListener('click', () => {
        if (!audioInitialized) initAudio();
        setActiveSpeedPreset(btnPresetNightcore);
        updateSpeed(1.25);
        
        // Deactivate lofi/reverb, boost highs
        if (toggleLofi && toggleLofi.checked) {
            toggleLofi.checked = false;
            toggleLofi.dispatchEvent(new Event('change'));
        }
        if (sliderReverb) {
            sliderReverb.value = 0;
            sliderReverb.dispatchEvent(new Event('input'));
        }
        if (eqPresetSelect) {
            eqPresetSelect.value = 'electronic';
            eqPresetSelect.dispatchEvent(new Event('change'));
        }
    });
}
