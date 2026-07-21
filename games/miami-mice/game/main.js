import { Game } from "./lib/game.js";
import musicGame from "./lib/soundbox/music_game.js";
import sfxHit from "./lib/soundbox/sfx_hit.js";
import sfxSwoosh from "./lib/soundbox/sfx_swoosh.js";

window.q = (s) => document.querySelector(s);

//window.game = null;

window.setBackground = (mood) => {  
    let waveColors = ['#54f', '#f47', '#ff4'];
    let skyColors = ['#ff4', '#fa4', '#40f', '#ff9'];
    let skyheight = '50vh';
    if(mood == 'night') {
        waveColors = ['#115', '#55f', '#acf'];
        skyColors = ['#eff', '#025', '#001', '#0af7'];
        skyheight = '40vh';
    } else if(mood == 'dusk') {
        waveColors = ['#227', '#c49', '#ff4'];
        skyColors = ['#fc0', '#d64', '#00a', '#ffa'];
        skyheight = '70vh';
    }
    document.querySelectorAll('.water').forEach(wave => {
        let gradScale = wave.gradScale;
        let gradient = 'repeating-linear-gradient(90deg, transparent 0, #fff1 40px, #fff1 45px, transparent 80px)';
        gradient += `,linear-gradient(90deg, ${waveColors[0]} ${50-gradScale *25}%, ${waveColors[1]} ${50-gradScale * 15}%, ${waveColors[2]} ${50-gradScale * 5}%, ${waveColors[2]} ${50+gradScale * 5}%, ${waveColors[1]} ${50+gradScale * 15}%, ${waveColors[0]} ${50+gradScale * 25}%)`;
        wave.firstElementChild.style.background = gradient;
        wave.style.backgroundColor = waveColors[0];
    });
    let sky = q('.sky');
    sky.style.height = skyheight;
    sky.style.background = `linear-gradient(0deg, ${skyColors[3]} 0%, transparent 70%),radial-gradient(circle, ${skyColors[0]} 10%, ${skyColors[1]} 11%, ${skyColors[2]} 75%)`;
};

document.addEventListener("DOMContentLoaded", () => {
    let water = q('.water');
    for(let y = 0; y < 45; y++) {
        let wave = water.cloneNode(true);
        wave.firstElementChild.style.animationDuration = (2 + Math.random() * 2) + 's';
        wave.style.top = `${y * 0.5 + 32}vh`;
        wave.gradScale = 0.7 - (y / 90);
        document.body.insertBefore(wave, water);
    }
    water.remove();
    setBackground('day');



    setTimeout(() => {
        const game = new Game("gameCanvas");
        window.gameStart = () => {
            game.start();
        };
        window.gameStartHorde = () => {
            game.startHorde();
        };
        window.gameRetry = () => {
            game.retry();
        };
        game.sfxPlayer.add("gamemusic", musicGame, true);
        game.sfxPlayer.add("hit", sfxHit);
        game.sfxPlayer.add("swoosh", sfxSwoosh);

        q('.load').remove();
        q('.intro').style.opacity = '1';

        //game.start();

    }, 100);
        
    
    
});