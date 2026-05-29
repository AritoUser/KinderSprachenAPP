// js/confetti.js
// Canvas-based confetti particle animation engine.
// Part of the KinderSprachenAPP open-source project.

let confettiActive = false;
const confettiParticles = [];
const confettiColors = ['#FF5B7F', '#5271FF', '#2EC4B6', '#FF9F1C', '#8338EC'];

export function startConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    confettiActive = true;
    confettiParticles.length = 0;
    
    for (let i = 0; i < 150; i++) {
        confettiParticles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * -canvas.height - 20,
            size: Math.random() * 8 + 5,
            color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
            speedY: Math.random() * 3 + 2,
            speedX: Math.random() * 2 - 1,
            rotation: Math.random() * 360,
            rotationSpeed: Math.random() * 10 - 5
        });
    }
    
    function animate() {
        if (!confettiActive) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        let alive = false;
        confettiParticles.forEach(p => {
            p.y += p.speedY;
            p.x += p.speedX;
            p.rotation += p.rotationSpeed;
            
            if (p.y < canvas.height) {
                alive = true;
            }
            
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation * Math.PI / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
        });
        
        if (alive) {
            requestAnimationFrame(animate);
        } else {
            confettiActive = false;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    
    animate();
}

// Adjust canvas size on window resize if active
window.addEventListener('resize', () => {
    if (confettiActive) {
        const canvas = document.getElementById('confetti-canvas');
        if (canvas) {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
    }
});
