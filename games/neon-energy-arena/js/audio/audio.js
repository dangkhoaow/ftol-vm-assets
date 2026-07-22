// 音频管理器
const AudioSys = {
    ctx: null,
    bgmGainNode: null,
    isMuted: false,
    volume: 0.5, // 添加音量控制
    bgmOscillators: [], // 用于存储 BGM 振荡器，以便停止
    lfoOscillators: [], // 用于存储 LFO 振荡器，以便停止
    
    // 音频类型常量
    AUDIO_TYPES: {
        SHOTGUN: 'shotgun',
        SNIPER: 'sniper',
        DEFAULT: 'default',
        BOMB: 'bomb',
        SPEED: 'speed'
    },
    
    // 音频配置
    AUDIO_CONFIGS: {
        shoot: {
            shotgun: {
                type: 'sawtooth',
                startFreq: 150,
                endFreq: 50,
                duration: 0.15,
                startGain: 0.2
            },
            sniper: {
                type: 'square',
                startFreq: 800,
                endFreq: 100,
                duration: 0.1,
                startGain: 0.15
            },
            default: {
                type: 'triangle',
                startFreq: 400,
                endFreq: 100,
                duration: 0.1,
                startGain: 0.1
            }
        },
        dash: {
            type: 'sawtooth',
            startFreq: 600,
            endFreq: 100,
            duration: 0.2,
            startGain: 0.05
        },
        powerUp: {
            bomb: {
                type: 'sine',
                startFreq: 300,
                endFreq: 600,
                duration: 0.3,
                startGain: 0.1
            },
            speed: {
                type: 'sine',
                startFreq: 800,
                endFreq: 1600,
                duration: 0.3,
                startGain: 0.1
            },
            default: {
                type: 'sine',
                startFreq: 600,
                endFreq: 1200,
                duration: 0.3,
                startGain: 0.1
            }
        }
    },
    
    // 初始化音频上下文
    init: function() {
        try {
            if (!this.ctx) {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            }
            // 监听用户交互，确保音频上下文可以恢复
            this._setupUserInteractionListener();
        } catch (error) {
            console.error('Failed to create AudioContext:', error);
            this.ctx = null;
        }
    },
    
    // 设置用户交互监听器，用于恢复音频上下文
    _setupUserInteractionListener: function() {
        const resumeAudio = () => {
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().catch(error => {
                    console.error('Failed to resume AudioContext:', error);
                });
            }
            // 移除监听器，避免重复调用
            document.removeEventListener('click', resumeAudio);
            document.removeEventListener('keydown', resumeAudio);
            document.removeEventListener('touchstart', resumeAudio);
        };
        
        // 添加多种用户交互事件监听器
        document.addEventListener('click', resumeAudio);
        document.addEventListener('keydown', resumeAudio);
        document.addEventListener('touchstart', resumeAudio);
    },
    
    // 公共音频播放函数
    _playOscillatorSound: function(config) {
        if (!this.ctx || this.isMuted) return;
        
        const {
            type,
            startFreq,
            endFreq,
            duration,
            startGain,
            freqRampType = 'exponential',
            gainRampType = 'exponential'
        } = config;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.type = type;
        osc.frequency.setValueAtTime(startFreq, this.ctx.currentTime);
        
        // 根据配置选择频率变化方式
        if (freqRampType === 'exponential') {
            osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + duration);
        } else {
            osc.frequency.linearRampToValueAtTime(endFreq, this.ctx.currentTime + duration);
        }
        
        // 设置初始增益并应用主音量
        gain.gain.setValueAtTime(startGain * this.volume, this.ctx.currentTime);
        
        // 根据配置选择增益变化方式
        if (gainRampType === 'exponential') {
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        } else {
            gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + duration);
        }
        
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    
    playShoot: function(type) {
        const config = this.AUDIO_CONFIGS.shoot[type] || this.AUDIO_CONFIGS.shoot.default;
        this._playOscillatorSound(config);
    },
    
    playDash: function() {
        this._playOscillatorSound(this.AUDIO_CONFIGS.dash);
    },
    
    playPowerUp: function(type) {
        const config = this.AUDIO_CONFIGS.powerUp[type] || this.AUDIO_CONFIGS.powerUp.default;
        this._playOscillatorSound({
            ...config,
            freqRampType: 'linear',
            gainRampType: 'linear'
        });
    },
    
    playExplosion: function(isBig = false) {
        if (!this.ctx || this.isMuted) return;
        
        const duration = isBig ? 1.0 : 0.5;
        const startGain = isBig ? 0.5 : 0.2;
        
        // 创建噪声缓冲区
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        // 生成白噪声
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.5; // 降低初始噪声幅度
        }
        
        const noise = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        
        filter.type = 'lowpass';
        filter.frequency.value = 1000;
        
        noise.buffer = buffer;
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        
        // 设置增益并应用主音量
        gain.gain.setValueAtTime(startGain * this.volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        
        noise.start();
        noise.stop(this.ctx.currentTime + duration);
    },
    
    startBGM: function() {
        if (!this.ctx) return;
        
        // 先停止现有的 BGM
        this.stopBGM();
        
        this.bgmGainNode = this.ctx.createGain();
        this.bgmGainNode.connect(this.ctx.destination);
        this.bgmGainNode.gain.value = this.isMuted ? 0 : 0.05 * this.volume;
        
        const freqs = [55, 110];
        freqs.forEach((f, index) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.connect(gain);
            gain.connect(this.bgmGainNode);
            
            osc.type = 'sine';
            osc.frequency.value = f;
            
            const lfo = this.ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 0.05 + (index * 0.02);
            
            const lfoGain = this.ctx.createGain();
            lfoGain.gain.value = 0.01;
            
            lfo.connect(lfoGain.gain);
            gain.gain.value = 0.5;
            
            osc.start();
            lfo.start();
            
            // 存储振荡器引用，以便后续停止
            this.bgmOscillators.push(osc);
            this.lfoOscillators.push(lfo);
        });
    },
    
    // 停止 BGM 并清理资源
    stopBGM: function() {
        // 停止并断开所有 BGM 振荡器
        this.bgmOscillators.forEach(osc => {
            try {
                osc.stop();
                osc.disconnect();
            } catch (error) {
                console.error('Error stopping BGM oscillator:', error);
            }
        });
        
        // 停止并断开所有 LFO 振荡器
        this.lfoOscillators.forEach(lfo => {
            try {
                lfo.stop();
                lfo.disconnect();
            } catch (error) {
                console.error('Error stopping LFO oscillator:', error);
            }
        });
        
        // 清空振荡器数组
        this.bgmOscillators = [];
        this.lfoOscillators = [];
        
        // 断开并清空 BGM 增益节点
        if (this.bgmGainNode) {
            this.bgmGainNode.disconnect();
            this.bgmGainNode = null;
        }
    },
    
    toggleMute: function() {
        this.isMuted = !this.isMuted;
        if (this.bgmGainNode) {
            this.bgmGainNode.gain.setTargetAtTime(
                this.isMuted ? 0 : 0.05 * this.volume, 
                this.ctx.currentTime, 
                0.1
            );
        }
        
        // 更新 UI
        if (typeof muteBtn !== 'undefined') {
            muteBtn.innerText = "Mute: " + (this.isMuted ? "ON" : "OFF");
            muteBtn.style.color = this.isMuted ? "#f05" : "#aaa";
        }
    },
    
    // 设置音量
    setVolume: function(newVolume) {
        this.volume = Math.max(0, Math.min(1, newVolume)); // 确保音量在 0-1 之间
        
        // 更新 BGM 音量
        if (this.bgmGainNode) {
            this.bgmGainNode.gain.setTargetAtTime(
                this.isMuted ? 0 : 0.05 * this.volume, 
                this.ctx.currentTime, 
                0.1
            );
        }
    }
};