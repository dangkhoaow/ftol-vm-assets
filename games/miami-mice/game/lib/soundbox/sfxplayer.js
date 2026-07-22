import SoundBoxPlayer from "./soundboxplayer.js";

export default class SFXPlayer {
    constructor() {
        this.sfx = {};
    }
    add(name, data, loop = false) {
        let musicplayer = new SoundBoxPlayer();
        musicplayer.init(data);
        while(musicplayer.generate() < 1) {}
        let wave = musicplayer.createWave();
        this.sfx[name] = document.createElement("audio");
        this.sfx[name].src = URL.createObjectURL(new Blob([wave], {type: "audio/wav"}));
        this.sfx[name].loop = loop;
        if(loop) {
            this.sfx[name].addEventListener('timeupdate', function(){
                let buffer = .15
                if(this.currentTime > this.duration - buffer){
                    this.currentTime = 0
                    this.play()
                }
            });
        }
        
    }

    playAudio(audioname, restart = true) {
        let audio = this.sfx[audioname];
        if(audio) {
            if(restart || audio.paused) {
                audio.currentTime = 0;
                audio.play();
            }
        }
    }
    
    stopAudio(audioname) {
        let audio = this.sfx[audioname];
        if(audio) {
            audio.pause();
            audio.currentTime = 0;
        }
    }
    
    isPlaying(audioname) {
        let audio = this.sfx[audioname];
        if(audio) {
            return !audio.paused;
        }
        return false;
    }
    
}

