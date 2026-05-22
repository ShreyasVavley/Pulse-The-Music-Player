function initVisualizer(analyserNode) {
    const canvas = document.getElementById('visualizer-canvas');
    const ctx = canvas.getContext('2d');
    
    function resizeCanvas() {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
    }
    
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    
    // We want a smooth visualizer
    analyserNode.smoothingTimeConstant = 0.85;
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const timeDataArray = new Uint8Array(bufferLength);
    
    const particles = [];
    let frameCounter = 0;
    
    function draw() {
        requestAnimationFrame(draw);
        
        analyserNode.getByteFrequencyData(dataArray);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Detect current visual theme
        const theme = window.visualizerTheme || 'luxury-gold';
        
        // Calculate bass average for dynamic sound-reactive aurora background pulsing!
        const activeBars = Math.floor(bufferLength / 2);
        const bassBars = Math.floor(activeBars * 0.15);
        let bassSum = 0;
        for (let i = 0; i < bassBars; i++) {
            bassSum += dataArray[i];
        }
        const bassAvg = bassSum / bassBars || 0;
        
        // WOW FACTOR: Sync ambient blur gradient scale directly to bass beat!
        const intensity = 0.95 + (bassAvg / 255) * 0.25;
        document.documentElement.style.setProperty('--pulse-intensity', intensity);
        
        // --- Render Theme Skins ---
        if (theme === 'luxury-gold') {
            const centerX = canvas.width / 2;
            const drawBars = Math.floor(bufferLength * 0.55);
            const barWidth = (canvas.width / drawBars) / 2;
            
            // Create beautiful gold luxury gradient
            const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
            gradient.addColorStop(0, "rgba(212, 175, 55, 0.1)");
            gradient.addColorStop(0.5, "rgba(212, 175, 55, 0.6)");
            gradient.addColorStop(1, "rgba(243, 229, 171, 0.9)");
            
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 3.5;
            ctx.lineCap = "round";
            ctx.shadowBlur = 15;
            ctx.shadowColor = "rgba(212, 175, 55, 0.6)";
            
            for (let i = 0; i < drawBars; i++) {
                const rawValue = dataArray[i];
                const barHeight = (rawValue / 255) * canvas.height * 0.72;
                const xOffset = i * (barWidth * 1.55);
                
                ctx.beginPath();
                
                // Draw right side
                ctx.moveTo(centerX + xOffset, canvas.height);
                ctx.lineTo(centerX + xOffset, canvas.height - barHeight);
                ctx.stroke();
                
                // Draw left side (mirrored)
                if (i > 0) {
                    ctx.beginPath();
                    ctx.moveTo(centerX - xOffset, canvas.height);
                    ctx.lineTo(centerX - xOffset, canvas.height - barHeight);
                    ctx.stroke();
                }
            }
        } 
        else if (theme === 'laser-wave') {
            analyserNode.getByteTimeDomainData(timeDataArray);
            
            ctx.beginPath();
            ctx.lineWidth = 3.5;
            
            // Cyan-Blue-Purple Cyber Gradient
            const waveGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
            waveGrad.addColorStop(0, '#00f2fe');
            waveGrad.addColorStop(0.5, '#4facfe');
            waveGrad.addColorStop(1, '#9b51e0');
            
            ctx.strokeStyle = waveGrad;
            ctx.shadowBlur = 20;
            ctx.shadowColor = 'rgba(0, 242, 254, 0.7)';
            
            for (let i = 0; i < bufferLength; i++) {
                const v = timeDataArray[i] / 128.0;
                const y = (v * canvas.height) / 2;
                const x = (i / bufferLength) * canvas.width;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        } 
        else if (theme === 'cosmic-ripple') {
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            
            // Base radius pulses with the beat
            const baseRadius = Math.min(canvas.width, canvas.height) * 0.16 + (bassAvg / 255) * 20;
            
            // Draw central glowing audio sun orb
            ctx.beginPath();
            ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 42, 95, 0.05)';
            ctx.fill();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = 'rgba(255, 42, 95, 0.35)';
            ctx.shadowBlur = 22;
            ctx.shadowColor = '#ff2a5f';
            ctx.stroke();
            
            // Radial frequency lines projecting outward like solar flares!
            const numRays = Math.floor(bufferLength * 0.45);
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            
            // Radial hot pink to deep gold color gradient
            const radialGrad = ctx.createRadialGradient(centerX, centerY, baseRadius, centerX, centerY, baseRadius + 80);
            radialGrad.addColorStop(0, '#ff2a5f');
            radialGrad.addColorStop(0.5, '#ff6a00');
            radialGrad.addColorStop(1, '#ffc800');
            
            ctx.strokeStyle = radialGrad;
            
            for (let i = 0; i < numRays; i++) {
                const angle = (i / numRays) * Math.PI * 2;
                const freqValue = dataArray[i];
                const rayLength = (freqValue / 255) * 85;
                
                const startX = centerX + Math.cos(angle) * baseRadius;
                const startY = centerY + Math.sin(angle) * baseRadius;
                const endX = centerX + Math.cos(angle) * (baseRadius + rayLength);
                const endY = centerY + Math.sin(angle) * (baseRadius + rayLength);
                
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            }
        } 
        else if (theme === 'cosmic-particles') {
            frameCounter++;
            
            // Extract the dynamic accent theme color
            let themeColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-dynamic').trim();
            if (!themeColor) themeColor = 'hsl(45, 100%, 50%)';
            
            // Spawn rate scales with bass power
            const spawnChance = 0.15 + (bassAvg / 255) * 0.65;
            if (particles.length < 80 && Math.random() < spawnChance) {
                particles.push({
                    x: Math.random() * canvas.width,
                    y: canvas.height + 10,
                    vx: (Math.random() * 2 - 1) * 0.6,
                    vy: -1.2 - (Math.random() * 1.5),
                    size: 2 + Math.random() * 4,
                    alpha: 1.0,
                    decay: 0.005 + Math.random() * 0.008,
                    waveOffset: Math.random() * Math.PI * 2,
                    speedFactor: 0.8 + Math.random() * 0.5
                });
            }
            
            // Render and update particles
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                
                // Update position: bass energy speeds them up and sends them soaring!
                const bassVelocityBoost = (bassAvg / 255) * 2.8 * p.speedFactor;
                p.y += p.vy - bassVelocityBoost;
                
                // Sinusoidal swaying
                p.x += p.vx + Math.sin(p.waveOffset + frameCounter * 0.03) * 0.4;
                
                // Fade out
                p.alpha -= p.decay;
                
                // Size pulse driven by volume
                const sizePulse = 1.0 + (bassAvg / 255) * 0.8;
                const renderSize = Math.max(1, p.size * sizePulse);
                
                // Remove if dead
                if (p.alpha <= 0 || p.y < -30 || p.x < -30 || p.x > canvas.width + 30) {
                    particles.splice(i, 1);
                    continue;
                }
                
                // Draw glowing audio-reactive particle
                ctx.beginPath();
                ctx.arc(p.x, p.y, renderSize, 0, Math.PI * 2);
                
                // Create radial glowing gradient
                const radGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, renderSize * 2.2);
                radGrad.addColorStop(0, themeColor.replace('50%)', `60%, ${p.alpha})`));
                radGrad.addColorStop(0.4, 'rgba(212, 175, 55, ' + (p.alpha * 0.45) + ')');
                radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                
                ctx.fillStyle = radGrad;
                ctx.shadowBlur = 12;
                ctx.shadowColor = themeColor;
                ctx.fill();
            }
            
            // Draw a subtle responsive energy wave field at the bottom source
            ctx.beginPath();
            ctx.moveTo(0, canvas.height);
            for (let i = 0; i <= 10; i++) {
                const x = (i / 10) * canvas.width;
                const freqBin = Math.floor((i / 10) * (bufferLength / 3));
                const waveHeight = (dataArray[freqBin] / 255) * 22;
                const y = canvas.height - waveHeight;
                ctx.lineTo(x, y);
            }
            ctx.lineTo(canvas.width, canvas.height);
            ctx.closePath();
            
            ctx.fillStyle = 'rgba(212, 175, 55, 0.04)';
            ctx.fill();
        }
    }
    
    draw();
}
