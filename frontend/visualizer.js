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
    
    function draw() {
        requestAnimationFrame(draw);
        
        analyserNode.getByteFrequencyData(dataArray);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const centerX = canvas.width / 2;
        // Use fewer bars for a cleaner look
        const activeBars = Math.floor(bufferLength / 2);
        const barWidth = (canvas.width / activeBars) / 2;
        
        // Create a beautiful gold luxury gradient
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, "rgba(212, 175, 55, 0.1)");
        gradient.addColorStop(0.5, "rgba(212, 175, 55, 0.6)");
        gradient.addColorStop(1, "rgba(243, 229, 171, 0.9)");
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.shadowBlur = 15;
        ctx.shadowColor = "rgba(212, 175, 55, 0.6)";
        
        let sum = 0;
        for (let i = 0; i < activeBars; i++) {
            const rawValue = dataArray[i];
            sum += rawValue;
            const barHeight = (rawValue / 255) * canvas.height * 0.7;
            const xOffset = i * (barWidth * 1.5);
            
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
        
        // WOW FACTOR: Sync background pulse with volume
        const avg = sum / activeBars;
        const intensity = 1 + (avg / 255) * 0.5;
        document.documentElement.style.setProperty('--pulse-intensity', intensity);
    }
    
    draw();
}
