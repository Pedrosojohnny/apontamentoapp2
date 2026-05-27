/**
 * scanner.js — Camera-based barcode scanner wrapper around html5-qrcode.
 *
 * Supports CODE_128, CODE_39, EAN_13, and QR_CODE.
 * Also handles scanning from a static image file (useful for testing on desktop).
 *
 * One scanner instance is shared across all screens. `stop()` must be called
 * before switching screens to release the camera lock — some browsers throw
 * if you open a new session while the previous one is still running.
 *
 * Exposed as `window.scanner`.
 */

class BarcodeScanner {
    constructor() {
        this.html5QrCode = null;
        this.cameras = [];
        this.currentCameraIndex = 0;
        this.lastElementId = null;
        this.config = {
            fps: 10,
            qrbox: { width: 320, height: 90 },
            formatsToSupport: [ 
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.QR_CODE
            ]
        };
    }

    async init() {
        try {
            this.cameras = await Html5Qrcode.getCameras();
            if (this.cameras && this.cameras.length > 0) {
                return true;
            }
            throw new Error('Nenhuma câmera encontrada.');
        } catch (e) {
            console.error('Erro ao inicializar câmeras:', e);
            return false;
        }
    }

    async start(elementId, onScanSuccess) {
        if (this.html5QrCode && this.lastElementId !== elementId) {
            try {
                await this.stop();
            } catch (e) {}
            this.html5QrCode = null;
        }

        if (!this.html5QrCode) {
            this.html5QrCode = new Html5Qrcode(elementId);
            this.lastElementId = elementId;
        }
        
        if (!this.cameras || this.cameras.length === 0) {
            await this.init();
        }

        const cameraId = this.cameras[this.currentCameraIndex].id;
        
        try {
            await this.html5QrCode.start(
                cameraId, 
                this.config,
                (decodedText) => {
                    this.playBeep();
                    this.triggerFlash(elementId);
                    onScanSuccess(decodedText);
                },
                (errorMessage) => {}
            );
            document.getElementById(elementId).classList.add('scanner-running');
        } catch (err) {
            console.warn('Tentando modo de câmera simplificado:', err);
            try {
                await this.html5QrCode.start(
                    cameraId, 
                    { fps: 10 }, 
                    (decodedText) => {
                        this.playBeep();
                        onScanSuccess(decodedText);
                    }
                );
                document.getElementById(elementId).classList.add('scanner-running');
            } catch (err2) {
                console.error('Falha crítica na câmera:', err2);
                alert('Erro ao acessar a câmera. Verifique permissões.');
            }
        }
    }

    async scanFile(file, callback) {
        // Se o scanner estiver rodando, precisamos parar antes de usar scanFile
        const isScanning = this.html5QrCode && this.html5QrCode.isScanning;
        
        if (!this.html5QrCode) {
            const elId = this.lastElementId || "reader";
            this.html5QrCode = new Html5Qrcode(elId);
            this.lastElementId = elId;
        }
        
        try {
            // Se estiver escaneando, para a câmera temporariamente
            if (isScanning) await this.html5QrCode.stop();

            const result = await this.html5QrCode.scanFile(file, true);
            this.playBeep();
            if (callback) callback(result);
            
            // Reinicia a câmera se ela estava rodando
            if (isScanning) {
                setTimeout(() => this.start(this.lastElementId, callback), 500);
            }
        } catch (err) {
            console.error('Erro ao ler arquivo:', err);
            alert('Não foi possível ler o código de barras nesta imagem. Verifique se a imagem está nítida e se é um código Code 128 válido.');
            
            // Reinicia a câmera se ela estava rodando
            if (isScanning) {
                setTimeout(() => this.start(this.lastElementId, callback), 500);
            }
        } finally {
            // Limpa o container para remover a imagem injetada pela biblioteca (apenas se não estiver rodando câmera)
            if (!this.html5QrCode.isScanning) {
                const container = document.getElementById(this.lastElementId);
                if (container) container.innerHTML = '';
            }
        }
    }

    async stop() {
        if (this.html5QrCode && this.html5QrCode.isScanning) {
            await this.html5QrCode.stop();
            if (this.lastElementId) {
                const el = document.getElementById(this.lastElementId);
                if (el) el.classList.remove('scanner-running');
            }
        }
    }

    async switch(elementId, onScanSuccess) {
        if (this.cameras.length < 2) return;
        await this.stop();
        this.currentCameraIndex = (this.currentCameraIndex + 1) % this.cameras.length;
        await this.start(elementId, onScanSuccess);
    }

    triggerFlash(elementId) {
        const container = document.getElementById(elementId).parentElement;
        let flash = container.querySelector('.scan-success-flash');
        if (!flash) {
            flash = document.createElement('div');
            flash.className = 'scan-success-flash';
            container.appendChild(flash);
        }
        flash.classList.add('flash-active');
        setTimeout(() => flash.classList.remove('flash-active'), 100);
    }

    playBeep() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.1);
        } catch (e) {
            console.warn('Beep falhou:', e);
        }
    }
}

window.scanner = new BarcodeScanner();
