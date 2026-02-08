class _NoteTexture {
    constructor() {
        this.image = null;
        this.scale = 1;
        this.head_split = 0;
        this.tail_split = 0;
    }
};

class _LineHeadTexture {
    constructor() {
        this.image = null;
        this.scale = 1;
        this.connect_point = 0;
    }
}

class _SeedBaseRandom {
    constructor() {
        this._map = new Map();
    }

    rand(seed) {
        if (this._map.has(seed)) {
            return this._map.get(seed);
        }

        const r = Math.random();
        this._map.set(seed, r);
        return r;
    }
}

class _ShaderTextureGenerator {
    constructor() {
        this._cv = document.createElement("canvas");
        this._gl = this._cv.getContext("webgl") || this._cv.getContext("experimental-webgl");

        this._gl.enable(this._gl.BLEND);

        const tex = this._gl.createTexture();
        this._gl.bindTexture(this._gl.TEXTURE_2D, tex);
        this._gl.texParameteri(this._gl.TEXTURE_2D, this._gl.TEXTURE_WRAP_S, this._gl.CLAMP_TO_EDGE);
        this._gl.texParameteri(this._gl.TEXTURE_2D, this._gl.TEXTURE_WRAP_T, this._gl.CLAMP_TO_EDGE);
        this._gl.texParameteri(this._gl.TEXTURE_2D, this._gl.TEXTURE_MIN_FILTER, this._gl.LINEAR);
        this._gl.clearColor(0, 0, 0, 0);

        this._seted_locations = new Map();
    }

    create_prog(fs_s) {
        const vs_s = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            varying vec2 uv;

            void main() {
                gl_Position = vec4(a_position, 0, 1);
                uv = a_texCoord;
            }
        `;
        
        const positions = [
            -1, 1,
            1, 1,
            -1, -1,
            1, -1,
        ];

        const texCoords = [
            0, 1,
            1, 1,
            0, 0,
            1, 0,
        ];

        const vs = this._gl.createShader(this._gl.VERTEX_SHADER);
        this._gl.shaderSource(vs, vs_s);
        this._gl.compileShader(vs);

        const fs = this._gl.createShader(this._gl.FRAGMENT_SHADER);
        this._gl.shaderSource(fs, fs_s);
        this._gl.compileShader(fs);

        const prog = this._gl.createProgram();
        if (!this._gl.getShaderParameter(vs, this._gl.COMPILE_STATUS)) {
            console.error("Error compiling vertex shader:", this._gl.getShaderInfoLog(vs));
            return null;
        }

        this._gl.attachShader(prog, vs);
        this._gl.attachShader(prog, fs);
        this._gl.linkProgram(prog);
        this._gl.useProgram(prog);

        const positionBuffer = this._gl.createBuffer();
        this._gl.bindBuffer(this._gl.ARRAY_BUFFER, positionBuffer);
        this._gl.bufferData(this._gl.ARRAY_BUFFER, new Float32Array(positions), this._gl.STATIC_DRAW);
        const posAttrLocation = this._gl.getAttribLocation(prog, "a_position");
        this._gl.vertexAttribPointer(posAttrLocation, 2, this._gl.FLOAT, false, 0, 0);
        this._gl.enableVertexAttribArray(posAttrLocation);

        const texCoordBuffer = this._gl.createBuffer();
        this._gl.bindBuffer(this._gl.ARRAY_BUFFER, texCoordBuffer);
        this._gl.bufferData(this._gl.ARRAY_BUFFER, new Float32Array(texCoords), this._gl.STATIC_DRAW);
        const texCoordAttrLocation = this._gl.getAttribLocation(prog, "a_texCoord");
        this._gl.vertexAttribPointer(texCoordAttrLocation, 2, this._gl.FLOAT, false, 0, 0);
        this._gl.enableVertexAttribArray(texCoordAttrLocation);

        const texLocation = this._gl.getUniformLocation(prog, "screenTexture");
        this._gl.uniform1i(texLocation, 0);

        return prog;
    }

    #set_location(loc, val) {
        if (typeof val == "boolean") {
            this._gl.uniform1i(loc, val ? 1 : 0);
        } else {
            this._gl[`uniform${val.length}fv`](loc, val);
        }

        this._seted_locations.set(loc, val);
    }

    #reset_locations() {
        this._seted_locations.forEach((val, loc) => {
            if (typeof val == "boolean") {
                this._gl.uniform1i(loc, 0);
            } else {
                this._gl[`uniform${val.length}fv`](loc, new Array(val.length).fill(0));
            }
        })
        this._seted_locations.clear();
    }

    draw(prog, img, uniforms) {
        if (uniforms.__enableAlpha) {
            this._gl.blendFunc(this._gl.SRC_ALPHA, this._gl.ONE_MINUS_SRC_ALPHA);
        } else {
            this._gl.blendFunc(this._gl.ONE, this._gl.ONE_MINUS_SRC_ALPHA);
        }

        this._gl.useProgram(prog);

        for (const key in uniforms) {
            let val = uniforms[key];
            if (typeof val == "number") val = [val];
            if (!prog[`${key}_loc`]) prog[`${key}_loc`] = this._gl.getUniformLocation(prog, key);
            const loc = prog[`${key}_loc`];
            this.#set_location(loc, val);
        }

        this._cv.width = img.width;
        this._cv.height = img.height;
        this._gl.viewport(0, 0, this._cv.width, this._cv.height);
        this._gl.clear(this._gl.COLOR_BUFFER_BIT);
        this._gl.texImage2D(this._gl.TEXTURE_2D, 0, this._gl.RGBA, this._gl.RGBA, this._gl.UNSIGNED_BYTE, img);
        this._gl.drawArrays(this._gl.TRIANGLE_STRIP, 0, 4);

        this.#reset_locations();

        const newcv = document.createElement("canvas");
        newcv.width = img.width;
        newcv.height = img.height;
        _warp_ctx2d(newcv.getContext("2d")).drawImage(this._cv, 0, 0);
        return newcv;
    }
}

function _warp_ctx2d(raw) {
    return new Proxy(raw, {
        get: function(target, prop, receiver) {
            if (prop == "drawImage") {
                return (...args) => {
                    if (!args[0].width || !args[0].height) {
                        return;
                    }

                    return raw.drawImage(...args);
                };
            }

            const value = target[prop];
            
            if (typeof value === "function") {
                return value.bind(target);
            }
            
            return value;
        },
        set: function(target, prop, value) {
            target[prop] = value;
            return true;
        }
    });
}

function _solve_wasm_path(dir) {
    return new URL(
        `${dir}/millune_h5bind_wasm.js`, 
        document.baseURI || window.location.href
    ).href;
}

async function _normToUint8Array(input) {
    if (input instanceof Uint8Array) {
        return input;
    }

    if (input instanceof Uint8ClampedArray) {
        return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }

    if (input instanceof ArrayBuffer) {
        return new Uint8Array(input);
    }

    if (ArrayBuffer.isView(input)) {
        return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }

    if (input instanceof Blob) {
        return await _normToUint8Array(await input.arrayBuffer());
    }

    throw new Error("Unsupported input type: " + Object.prototype.toString.call(input));
}

class MilLunePlayer {
    constructor(options) {
        options = options || {};

        if (!options.buildDirectory) {
            throw new Error("No buildDirectory specified");
        }

        if (!options.canvas) {
            throw new Error("No canvas specified");
        }

        if (!options.resourcePackPath) {
            throw new Error("No resourcePackPath specified");
        }

        if (!options.canvas.getContext("2d")) {
            throw new Error("Canvas does not support 2d context");
        }

        if (!options.chartPath) {
            throw new Error("No chartPath specified");
        }

        if (!options.audioPath) {
            throw new Error("No audioPath specified");
        }

        if (!options.illuPath) {
            throw new Error("No illuPath specified");
        }

        if (!options.fontFam) {
            throw new Error("No fontFam specified");
        }

        if (!options.pauseBtnPath) {
            throw new Error("No pauseBtnPath specified");
        }

        if (!options.storyboardTextureLoader) {
            throw new Error("No storyboardTextureLoader specified");
        }

        if (options.isAutoplay === void 0) {
            throw new Error("No isAutoplay specified");
        }

        this._buildDirectory = options.buildDirectory;
        this._resourcePackPath = options.resourcePackPath;
        this._canvas = options.canvas;
        this._chartPath = options.chartPath;
        this._audioPath = options.audioPath;
        this._illuPath = options.illuPath;
        this._fontFam = options.fontFam;
        this._pauseBtnPath = options.pauseBtnPath;
        this._storyboardTextureLoader = options.storyboardTextureLoader;
        this._isAutoplay = options.isAutoplay;
    }

    async init() {
        this._rand = new _SeedBaseRandom();

        const module = await import(_solve_wasm_path(this._buildDirectory));
        this._instance = await module.default();

        this._ctx = this.#call_wasm("h5bind_create_context");

        this.#set_rendering_func("drawBackground", this._instance.addFunction(this.#drawBackground.bind(this), "v"));
        this.#set_rendering_func("drawMilLineHead", this._instance.addFunction(this.#drawMilLineHead.bind(this), "vdddi"));
        this.#set_rendering_func("drawLine", this._instance.addFunction(this.#drawLine.bind(this), "vdddddi"));
        this.#set_rendering_func("drawPointNote", this._instance.addFunction(this.#drawPointNote.bind(this), "vidddddi"));
        this.#set_rendering_func("drawHold", this._instance.addFunction(this.#drawHold.bind(this), "vidddddddi"));
        this.#set_rendering_func("getTextureSize", this._instance.addFunction(this.#getTextureSize.bind(this), "viii"));
        this.#set_rendering_func("getScreenSize", this._instance.addFunction(this.#getScreenSize.bind(this), "vii"));
        this.#set_rendering_func("playClicksound", this._instance.addFunction(this.#playClicksound.bind(this), "vi"));
        this.#set_rendering_func("getDuration", this._instance.addFunction(this.#getDuration.bind(this), "vi"));
        this.#set_rendering_func("drawPauseBtn", this._instance.addFunction(this.#drawPauseBtn.bind(this), "vddddd"));
        this.#set_rendering_func("drawProgressBar", this._instance.addFunction(this.#drawProgressBar.bind(this), "vdd"));
        this.#set_rendering_func("drawText", this._instance.addFunction(this.#drawText.bind(this), "vijdddiiii"));
        this.#set_rendering_func("loadStoryboardTexture", this._instance.addFunction(this.#loadStoryboardTexture.bind(this), "vijiii"));
        this.#set_rendering_func("drawStoryboardText", this._instance.addFunction(this.#drawStoryboardText.bind(this), "vijddddddi"));
        this.#set_rendering_func("drawStoryboardPicture", this._instance.addFunction(this.#drawStoryboardPicture.bind(this), "vjdddddddi"));
        this.#set_rendering_func("releaseStoryboardTexture", this._instance.addFunction(this.#releaseStoryboardTexture.bind(this), "vj"));
        this.#set_rendering_func("createClickEffectTexture", this._instance.addFunction(this.#createClickEffectTexture.bind(this), "vjdiii"));
        this.#set_rendering_func("drawClickEffectTexture", this._instance.addFunction(this.#drawClickEffectTexture.bind(this), "vjidddd"));
        this.#set_rendering_func("releaseClickEffectTexture", this._instance.addFunction(this.#releaseClickEffectTexture.bind(this), "vj"));
        this.#set_rendering_func("drawEllipse", this._instance.addFunction(this.#drawEllipse.bind(this), "vdddddi"));
        this.#set_rendering_func("getResourcePackNoteScale", this._instance.addFunction(this.#getResourcePackNoteScale.bind(this), "vii"));
        this.#set_rendering_func("getResourcePackLineHeadScale", this._instance.addFunction(this.#getResourcePackLineHeadScale.bind(this), "vi"));
        this.#set_rendering_func("getResourcePackLineHeadConnectPoint", this._instance.addFunction(this.#getResourcePackLineHeadConnectPoint.bind(this), "vi"));
        this.#set_rendering_func("drawRect", this._instance.addFunction(this.#drawRect.bind(this), "vddddi"));
        this.#set_rendering_func("drawCompletionStatus", this._instance.addFunction(this.#drawCompletionStatus.bind(this), "vijiiiijd"));

        const resourcePackData = await fetch(this._resourcePackPath).then(response => response.arrayBuffer());
        const resourcePackDataPtr = this.#malloc_array_buffer(resourcePackData);
        this._resourcePack = this.#call_wasm("h5bind_create_resource_pack", resourcePackDataPtr, BigInt(resourcePackData.byteLength));
        this.#free(resourcePackDataPtr);

        this._image_resizeopt_factor = this.#is_mobile() ? 0.5 : 1.0;

        this._all_note_keys = [
            "tap", "tap_double", "extap", "extap_double",
            "hold", "hold_double", "exhold", "exhold_double",
            "drag", "drag_double", "exdrag", "exdrag_double"
        ];

        this._note_texture_map = new Map();

        for (const key of this._all_note_keys) {
            const texture = this.#get_note_texture(key);
            this._note_texture_map.set(key, texture);
        }

        this._line_head_texture = this.#get_line_head_texture();

        for (const tex of this._note_texture_map.values()) {
            tex.image = await tex.image;
        }

        this._line_head_texture.image = await this._line_head_texture.image;

        this._audioCtx = new AudioContext({
            latencyHint: "interactive"
        });

        this._hitsound_map = new Map();

        for (const key of this._all_note_keys) {
            const hitsound = this.#get_hitsound(key);
            this._hitsound_map.set(key, hitsound);
        }

        for (const key of this._hitsound_map.keys()) {
            this._hitsound_map.set(key, await this._hitsound_map.get(key));
        }

        const audioData = await fetch(this._audioPath).then(response => response.arrayBuffer());
        this._audioClip = await this._audioCtx.decodeAudioData(audioData);
        this._currentAudioSource = null;
        this._audioTime = 0;

        this._texIdBase = 0;
        this._stgen = new _ShaderTextureGenerator();
        this._clickEffectProg = this._stgen.create_prog(`
precision highp float;
varying lowp vec2 uv;

uniform float p;
uniform float seed;
uniform float innerCircRadius;
uniform vec3 color;

float rand(vec2 n) { 
    return fract(sin(dot(n, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 ip = floor(p);
    vec2 fp = fract(p);
    
    float a = rand(ip);
    float b = rand(ip + vec2(1.0, 0.0));
    float c = rand(ip + vec2(0.0, 1.0));
    float d = rand(ip + vec2(1.0, 1.0));
    
    vec2 u = fp * fp * (3.0 - 2.0 * fp);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float circularNoise(vec2 uv, float density, float seed) {
    vec2 center = uv - 0.5;
    float radius = length(center) * density;
    float angle = abs(atan(center.y, center.x));

    if (uv.y > 0.5) {
        angle += sin(angle) * 2.;
    }

    vec2 seedOffset = vec2(seed * 100.0, seed * 100.0);
    vec2 polarCoord = vec2(radius, angle) + seedOffset;
    
    float n = 0.0;
    n += noise(polarCoord) * 0.7;
    n += noise(polarCoord * 2.0) * 0.3;
    n += noise(polarCoord * 4.0) * 0.1;
    
    return n;
}

void main() {
    gl_FragColor.rgb = color;
    gl_FragColor.a = 1.0;
    float l = length(uv - 0.5);

    if (innerCircRadius <= l && l <= 0.5) {
        float n = circularNoise(uv, 50.0, seed);
        gl_FragColor.a *= (n < p) ? 0.0 : 1.0;
    } else {
        gl_FragColor.a = 0.0;
    }
}
`);

        this._clickEffectMap = new Map();
        this._storyboardTextureMap = new Map();

        this.#call_wasm("h5bind_init_context", this._ctx);

        for (const key of this._clickEffectMap.keys()) {
            const pair = this._clickEffectMap.get(key);
            this._clickEffectMap.set(key, await Promise.all(pair));
        }

        const chartData = await fetch(this._chartPath).then(response => response.arrayBuffer());
        const chartDataPtr = this.#malloc_array_buffer(chartData);
        this.#call_wasm("h5bind_load_chart", this._ctx, chartDataPtr, BigInt(chartData.byteLength));
        this.#free(chartDataPtr);

        if (!this._isAutoplay) {
            this.#call_wasm("h5bind_disable_autoplay", this._ctx);
        }

        this._illuImage = await this.#load_image_from_path(this._illuPath);
        this._pauseBtnImage = await this.#load_image_from_path(this._pauseBtnPath);

        this._cvctx = _warp_ctx2d(this._canvas.getContext("2d"));

        if (this.#is_mobile()) {
            this._cvctx.imageSmoothingEnabled = false;
        }

        this._holdcv = document.createElement("canvas");
        this._applycolorcv = document.createElement("canvas");

        this._canvas.setAttribute("tabindex", "0");
        this._canvas.focus();

        let isTouchDevice = false;

        this._canvas.addEventListener("keydown", e => {
            if (!this._currentAudioSource) return;
            if (e.repeat) return;
            const t = this.get_chart_time();
            this.#call_wasm("h5bind_judgement_keydown", this._ctx, t, BigInt(1000 + e.keyCode));
        });

        this._canvas.addEventListener("keyup", e => {
            if (!this._currentAudioSource) return;
            const t = this.get_chart_time();
            this.#call_wasm("h5bind_judgement_keyup", this._ctx, t, BigInt(1000 + e.keyCode));
        });

        this._canvas.addEventListener("touchstart", e => {
            isTouchDevice = true;
            if (!this._currentAudioSource) return;
            const t = this.get_chart_time();
            const touch = e.changedTouches[0];
            this.#call_wasm("h5bind_judgement_touchstart", this._ctx, t, BigInt(touch.identifier), touch.clientX, touch.clientY);
        });

        this._canvas.addEventListener("touchmove", e => {
            isTouchDevice = true;
            if (!this._currentAudioSource) return;
            const t = this.get_chart_time();
            const touch = e.changedTouches[0];
            this.#call_wasm("h5bind_judgement_touchmove", this._ctx, t, BigInt(touch.identifier), touch.clientX, touch.clientY);
        });

        this._canvas.addEventListener("touchend", e => {
            isTouchDevice = true;
            if (!this._currentAudioSource) return;
            const t = this.get_chart_time();
            const touch = e.changedTouches[0];
            this.#call_wasm("h5bind_judgement_touchend", this._ctx, t, BigInt(touch.identifier));
        });

        this._canvas.addEventListener("mousedown", e => {
            if (!this._currentAudioSource) return;
            if (isTouchDevice) return;
            const t = this.get_chart_time();
            this.#call_wasm("h5bind_judgement_touchstart", this._ctx, t, BigInt(2000 + e.button), e.clientX, e.clientY);
        });

        this._canvas.addEventListener("mousemove", e => {
            if (!this._currentAudioSource) return;
            if (isTouchDevice) return;
            if (e.buttons <= 0) return;
            const t = this.get_chart_time();
            this.#call_wasm("h5bind_judgement_touchmove", this._ctx, t, BigInt(2000 + e.button), e.clientX, e.clientY);
        });

        this._canvas.addEventListener("mouseup", e => {
            if (!this._currentAudioSource) return;
            if (isTouchDevice) return;
            const t = this.get_chart_time();
            this.#call_wasm("h5bind_judgement_touchend", this._ctx, t, BigInt(2000 + e.button));
        });
    }

    #call_wasm(func, ...args) {
        return this._instance["_" + func](...args);
    }

    #malloc_string(str) {
        const len = this._instance.lengthBytesUTF8(str);
        const ptr = this.#call_wasm("malloc", len + 1);
        this._instance.stringToUTF8(str, ptr, len + 1);
        return ptr;
    }

    #malloc_array_buffer(buffer) {
        const ptr = this.#call_wasm("malloc", buffer.byteLength);
        new Uint8Array(this._instance.HEAPU8.buffer, ptr, buffer.byteLength).set(new Uint8Array(buffer));
        return ptr;
    }

    #free(ptr) {
        this.#call_wasm("free", ptr);
    }

    #read_string(ptr) {
        return this._instance.UTF8ToString(ptr);
    }

    #read_string_with_size(ptr, size) {
        const new_ptr = this.#call_wasm("malloc", size + 1);
        new Uint8Array(this._instance.HEAPU8.buffer, new_ptr, size).set(new Uint8Array(this._instance.HEAPU8.buffer, ptr, size));
        this._instance.HEAPU8[new_ptr + size] = 0;
        const result = this.#read_string(new_ptr);
        this.#free(new_ptr);
        return result;
    }

    #read_string_and_free(ptr) {
        const str = this.#read_string(ptr);
        this.#free(ptr);
        return str;
    }

    #set_rendering_func(name, func) {
        const sptr = this.#malloc_string(name);
        this.#call_wasm("h5bind_context_set_rendering_func", this._ctx, sptr, func);
        this.#free(sptr);
    }

    #get_note_key(type) {
        const ptr = this.#call_wasm("h5bind_mil_get_note_key", type);
        return this.#read_string_and_free(ptr);
    }

    #read_f64(ptr) {
        const view = new DataView(this._instance.HEAPU8.buffer);
        const result = view.getFloat64(ptr, true);
        return result;
    }

    #read_u64(ptr) {
        const view = new DataView(this._instance.HEAPU8.buffer);
        const result = view.getBigUint64(ptr, true);
        return result;
    }

    #set_f64(ptr, value) {
        const view = new DataView(this._instance.HEAPU8.buffer);
        view.setFloat64(ptr, value, true);
    }

    #set_u64(ptr, value) {
        const view = new DataView(this._instance.HEAPU8.buffer);
        view.setBigUint64(ptr, BigInt(value), true);
    }

    #get_note_texture(key) {
        const info_size = 8 * 6;
        const info_ptr = this.#call_wasm("malloc", info_size);
        const key_ptr = this.#malloc_string(key);
        const tex_ptr = this.#call_wasm(
            "h5bind_get_note_texture",
            this._resourcePack,
            key_ptr,
            info_ptr,
            info_ptr + 8,
            info_ptr + 16,
            info_ptr + 24,
            info_ptr + 32,
            info_ptr + 40,
        );
        const scale = this.#read_f64(info_ptr);
        const head_split = parseInt(this.#read_u64(info_ptr + 8));
        const tail_split = parseInt(this.#read_u64(info_ptr + 16));
        const output_width = parseInt(this.#read_u64(info_ptr + 24));
        const output_height = parseInt(this.#read_u64(info_ptr + 32));
        const output_size = parseInt(this.#read_u64(info_ptr + 40));
        const rgba_data = new Uint8ClampedArray(this._instance.HEAPU8.buffer, tex_ptr, output_size).slice();
        this.#free(key_ptr);
        this.#free(info_ptr);
        this.#free(tex_ptr);

        const result = new _NoteTexture();
        result.image = this.#create_image_bitmap(new ImageData(
            rgba_data, output_width, output_height
        ));
        result.scale = scale;
        result.head_split = head_split * this._image_resizeopt_factor;
        result.tail_split = tail_split * this._image_resizeopt_factor;

        return result;
    }

    #get_line_head_texture() {
        const info_size = 8 * 5;
        const info_ptr = this.#call_wasm("malloc", info_size);
        const tex_ptr = this.#call_wasm(
            "h5bind_get_line_head_texture",
            this._resourcePack,
            info_ptr,
            info_ptr + 8,
            info_ptr + 16,
            info_ptr + 24,
            info_ptr + 32,
        );
        const scale = this.#read_f64(info_ptr);
        const connect_point = this.#read_f64(info_ptr + 8);
        const output_width = parseInt(this.#read_u64(info_ptr + 16));
        const output_height = parseInt(this.#read_u64(info_ptr + 24));
        const output_size = parseInt(this.#read_u64(info_ptr + 32));
        const rgba_data = new Uint8ClampedArray(this._instance.HEAPU8.buffer, tex_ptr, output_size).slice();
        this.#free(info_ptr);
        this.#free(tex_ptr);

        const result = new _LineHeadTexture();
        result.image = this.#create_image_bitmap(new ImageData(
            rgba_data, output_width, output_height
        ));
        result.scale = scale;
        result.connect_point = connect_point * this._image_resizeopt_factor;

        return result;
    }

    async #get_hitsound(key) {
        const info_size = 8;
        const info_ptr = this.#call_wasm("malloc", info_size);
        const key_ptr = this.#malloc_string(key);
        const audio_ptr = this.#call_wasm(
            "h5bind_get_hitsound",
            this._resourcePack,
            key_ptr,
            info_ptr,
        );
        const output_size = parseInt(this.#read_u64(info_ptr));
        const encoded_audio = new Uint8Array(this._instance.HEAPU8.buffer, audio_ptr, output_size).slice();
        this.#free(key_ptr);
        this.#free(info_ptr);
        this.#free(audio_ptr);

        const clip = await this._audioCtx.decodeAudioData(encoded_audio.buffer);
        return clip;
    }

    #create_audio_buffer_source(clip) {
        const source = this._audioCtx.createBufferSource();
        source.buffer = clip;
        source.connect(this._audioCtx.destination);
        return source;
    }

    #parse_color(color) {
        return [
            ((color >> 24) & 0xff) / 0xff,
            ((color >> 16) & 0xff) / 0xff,
            ((color >> 8) & 0xff) / 0xff,
            (color & 0xff) / 0xff
        ];
    }

    #get_text_align(align) {
        if (align == 0) return "left";
        if (align == 1) return "center";
        if (align == 2) return "right";
        return "left";
    }

    #get_text_baseline(baseline) {
        if (baseline == 0) return "top";
        if (baseline == 1) return "middle";
        if (baseline == 2) return "bottom";
        return "top";
    }

    #load_image_from_path(path) {
        const img = new Image();
        return new Promise((resolve, reject) => {
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = path;
        }).then(this.#create_image_bitmap.bind(this));
    }

    #create_click_effect_texture_item(rand, p, color) {
        const cv = document.createElement("canvas");
        cv.width = cv.height = 256;
        return this.#create_image_bitmap(this._stgen.draw(this._clickEffectProg, cv, {
            __enableAlpha: true,
            p: p,
            seed: rand,
            innerCircRadius: 465 / 1080,
            color: this.#parse_color(color).slice(0, 3)
        }));
    }

    #apply_color_at_image(img, color) {
        if (Math.abs(color[0] - 1) + Math.abs(color[1] - 1) + Math.abs(color[2] - 1) < 0.0001) return img;
        
        const ctx = _warp_ctx2d(this._applycolorcv.getContext("2d"));
        this._applycolorcv.width = img.width;
        this._applycolorcv.height = img.height;
        
        ctx.save();
        ctx.fillStyle = `rgb(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255})`;
        ctx.fillRect(0, 0, this._applycolorcv.width, this._applycolorcv.height);
        ctx.globalCompositeOperation = "multiply";
        ctx.drawImage(img, 0, 0);
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(img, 0, 0);
        ctx.restore();

        return this._applycolorcv;
    }

    #is_mobile() {
        if (navigator.userAgentData?.mobile) return true;
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    async #create_image_bitmap(img) {
        return await createImageBitmap(img, this._image_resizeopt_factor === 1 ? (void 0) : {
            resizeWidth: Math.max(1, parseInt(img.width * this._image_resizeopt_factor)),
            resizeHeight: Math.max(1, parseInt(img.height * this._image_resizeopt_factor))
        });
    }

    #drawBackground() {
        this._cvctx.save();
        this._cvctx.beginPath();
        this._cvctx.rect(0, 0, this._canvas.width, this._canvas.height);
        this._cvctx.clip();

        const r = this._illuImage.width / this._illuImage.height;
        const sr = this._canvas.width / this._canvas.height;
        let width, height;

        if (r > sr) {
            height = this._canvas.height;
            width = height * r;
        } else {
            width = this._canvas.width;
            height = width / r;
        }

        const x = (this._canvas.width - width) / 2;
        const y = (this._canvas.height - height) / 2;

        this._cvctx.drawImage(this._illuImage, x, y, width, height);
        this._cvctx.restore();

        this._cvctx.save();
        this._cvctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        this._cvctx.fillRect(0, 0, this._canvas.width, this._canvas.height);
        this._cvctx.restore();

        const grd = this._cvctx.createLinearGradient(0, this._canvas.height * 0.6, 0, this._canvas.height);
        const n = 6;
        for (let i = 0; i < n; i++) {
            const p = i / (n - 1);
            const a = Math.pow(p, 2.2);
            grd.addColorStop(p, `rgba(0, 0, 0, ${a})`);
        }

        this._cvctx.save();
        this._cvctx.fillStyle = grd;
        this._cvctx.fillRect(0, this._canvas.height * 0.6, this._canvas.width, this._canvas.height);
        this._cvctx.restore();
    }

    #drawMilLineHead(x, y, size, color) {
        color = this.#parse_color(color);
        this._cvctx.save();
        this._cvctx.translate(x, y);
        this._cvctx.globalAlpha = color[3];
        this._cvctx.drawImage(this.#apply_color_at_image(this._line_head_texture.image, color), -size / 2, -size / 2, size, size);
        this._cvctx.restore();
    }

    #drawLine(x0, y0, x1, y1, width, color) {
        color = this.#parse_color(color);
        this._cvctx.save();
        this._cvctx.beginPath();
        this._cvctx.moveTo(x0, y0);
        this._cvctx.lineTo(x1, y1);
        this._cvctx.lineWidth = width;
        this._cvctx.strokeStyle = `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, ${color[3]})`;
        this._cvctx.stroke();
        this._cvctx.restore();
    }

    #drawPointNote(type, x, y, width, height, rotate, color) {
        color = this.#parse_color(color);
        this._cvctx.save();
        this._cvctx.translate(x, y);
        this._cvctx.rotate(rotate * Math.PI / 180);
        const texture = this._note_texture_map.get(this.#get_note_key(type));
        this._cvctx.globalAlpha = color[3];
        this._cvctx.drawImage(this.#apply_color_at_image(texture.image, color), -width / 2, -height / 2, width, height);
        this._cvctx.restore();
    }

    #drawHold(type, x, y, head, body, tail, height, rotate, color) {
        color = this.#parse_color(color);
        const holdctx = _warp_ctx2d(this._holdcv.getContext("2d"));
        const texture = this._note_texture_map.get(this.#get_note_key(type));
        
        head = parseInt(head);
        body = parseInt(body);
        tail = parseInt(tail);
        height = parseInt(height);

        this._holdcv.width = head + body + tail;
        this._holdcv.height = height;
        holdctx.clearRect(0, 0, this._holdcv.width, this._holdcv.height);

        holdctx.drawImage(
            texture.image,
            0, 0, texture.head_split, texture.image.height,
            0, 0, head, height
        );

        holdctx.drawImage(
            texture.image,
            texture.head_split, 0, texture.image.width - texture.head_split - texture.tail_split, texture.image.height,
            head, 0, body, height
        );

        holdctx.drawImage(
            texture.image,
            texture.image.width - texture.tail_split, 0, texture.tail_split, texture.image.height,
            head + body, 0, tail, height
        );

        this._cvctx.save();
        this._cvctx.translate(x, y);
        this._cvctx.rotate(rotate * Math.PI / 180);
        this._cvctx.globalAlpha = color[3];
        this._cvctx.drawImage(this.#apply_color_at_image(this._holdcv, color), -head, -height / 2);
        this._cvctx.restore();
    }

    #getTextureSize(type, width, height) {
        const key = this.#get_note_key(type);
        const texture = this._note_texture_map.get(key);
        this.#set_f64(width, texture.image.width);
        this.#set_f64(height, texture.image.height);
    }

    #getScreenSize(width, height) {
        this.#set_f64(width, this._canvas.width);
        this.#set_f64(height, this._canvas.height);
    }

    #playClicksound(type) {
        const key = this.#get_note_key(type);
        const clip = this._hitsound_map.get(key);
        const source = this.#create_audio_buffer_source(clip);
        source.start(0);
    }

    #getDuration(duration) {
        this.#set_f64(duration, this._audioClip.duration);
    }

    #drawPauseBtn(x, y, width, height, alpha) {
        this._cvctx.save();
        this._cvctx.globalAlpha = alpha;
        this._cvctx.drawImage(this._pauseBtnImage, x, y, width, height);
        this._cvctx.restore();
    }

    #drawProgressBar(p, alpha) {
        const grd = this._cvctx.createLinearGradient(0, 0, this._canvas.width * p, 0);
        const n = 30;
        for (let i = 0; i < n; i++) {
            const p = i / (n - 1);
            const a = Math.pow(p, 2.2);
            grd.addColorStop(p, `rgba(255, 255, 255, ${a})`);
        }

        this._cvctx.save();
        this._cvctx.globalAlpha = alpha;
        this._cvctx.fillStyle = grd;
        this._cvctx.fillRect(0, 0, this._canvas.width * p, this._canvas.height * 9 / 1080);
        this._cvctx.restore();
    }

    #drawText(data, size, x, y, fontsize, bold, align, baseline, color) {
        const string = this.#read_string_with_size(data, parseInt(size));
        color = this.#parse_color(color);
        this._cvctx.save();
        this._cvctx.font = `${fontsize}px ${this._fontFam}`;
        this._cvctx.textAlign = this.#get_text_align(align);
        this._cvctx.textBaseline = this.#get_text_baseline(baseline);
        this._cvctx.fillStyle = `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, ${color[3]})`;
        this._cvctx.fillText(string, x, y);
        this._cvctx.restore();
    }

    #loadStoryboardTexture(data, size, texIdP, width, height) {
        const key = this.#read_string_with_size(data, parseInt(size));
        const image = this._storyboardTextureLoader(key);
        const texId = this._texIdBase++;
        this.#set_u64(texIdP, texId);

        if (image) {
            this.#set_u64(width, image.width);
            this.#set_u64(height, image.height);
            this._storyboardTextureMap.set(texId, image);
        }
    }

    #drawStoryboardText(data, size, x, y, sx, sy, rotate, fontsize, color) {
        const s = this.#read_string_with_size(data, parseInt(size));
        color = this.#parse_color(color);
        
        this._cvctx.save();
        this._cvctx.translate(x, y);
        this._cvctx.rotate(rotate * Math.PI / 180);
        this._cvctx.scale(sx, sy);
        this._cvctx.font = `${fontsize}px ${this._fontFam}`;
        this._cvctx.textAlign = "center";
        this._cvctx.textBaseline = "middle";
        this._cvctx.fillStyle = `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, ${color[3]})`;
        this._cvctx.fillText(s, 0, 0);
        this._cvctx.restore();
    }

    #drawStoryboardPicture(texId, x, y, width, height, sx, sy, rotate, color) {
        if (!this._storyboardTextureMap.has(texId)) return;

        color = this.#parse_color(color);
        this._cvctx.save();
        this._cvctx.translate(x, y);
        this._cvctx.rotate(rotate * Math.PI / 180);
        this._cvctx.scale(sx, sy);
        this._cvctx.globalAlpha = color[3];
        this._cvctx.drawImage(this.#apply_color_at_image(this._storyboardTextureMap.get(texId), color), -width / 2, -height / 2, width, height);
        this._cvctx.restore();
    }

    #releaseStoryboardTexture(texId) {
        if (!this._storyboardTextureMap.has(texId)) return;
        this._storyboardTextureMap.delete(texId);
    }

    #createClickEffectTexture(groupId, p, perfectColor, goodColor, texIdP) {
        const rand = this._rand.rand(groupId);
        const texId = this._texIdBase++;
        this.#set_u64(texIdP, texId);

        const ptex = this.#create_click_effect_texture_item(rand, p, perfectColor);
        const gtex = this.#create_click_effect_texture_item(rand, p, goodColor);

        this._clickEffectMap.set(texId, [ptex, gtex]);
    }

    #drawClickEffectTexture(texId, isPerfect, x, y, size, rotate) {
        const pair = this._clickEffectMap.get(parseInt(texId));
        const tex = isPerfect ? pair[0] : pair[1];
        
        this._cvctx.save();
        this._cvctx.translate(x, y);
        this._cvctx.rotate(rotate * Math.PI / 180);
        this._cvctx.drawImage(tex, -size / 2, -size / 2, size, size);
        this._cvctx.restore();
    }

    #releaseClickEffectTexture(texId) {
        this._clickEffectMap.delete(texId);
    }

    #drawEllipse(x, y, rx, ry, rotate, color) {
        color = this.#parse_color(color);
        this._cvctx.save();
        this._cvctx.translate(x, y);
        this._cvctx.rotate(rotate);
        this._cvctx.fillStyle = `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, ${color[3]})`;
        this._cvctx.beginPath();
        this._cvctx.ellipse(0, 0, rx, ry, 0, 0, 2 * Math.PI);
        this._cvctx.fill();
        this._cvctx.restore();
    }

    #getResourcePackNoteScale(type, scale) {
        const key = this.#get_note_key(type);
        const texture = this._note_texture_map.get(key);
        this.#set_f64(scale, texture.scale);
    }

    #getResourcePackLineHeadScale(scale) {
        this.#set_f64(scale, this._line_head_texture.scale);
    }

    #getResourcePackLineHeadConnectPoint(point) {
        this.#set_f64(point, this._line_head_texture.connect_point / (this._line_head_texture.image.height / 2));
    }

    #drawRect(x, y, width, height, color) {
        color = this.#parse_color(color);
        this._cvctx.save();
        this._cvctx.fillStyle = `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, ${color[3]})`;
        this._cvctx.fillRect(x, y, width, height);
        this._cvctx.restore();
    }

    #drawCompletionStatus(data, size, grd_progress, grd_reds, grd_greens, grd_blues, grd_step_count, scale) {

    }

    start(t = 0) {
        if (this._currentAudioSource) {
            this._currentAudioSource.onended = null;
            this._currentAudioSource.disconnect();
        }

        this._currentAudioSource = this.#create_audio_buffer_source(this._audioClip);
        this._currentAudioSource.start(0, t);
        this._currentAudioSource.start_time = this._audioCtx.currentTime - t;
        this._currentAudioSource.onended = () => {
            this._currentAudioSource.disconnect();
            this._currentAudioSource = null;
            this._audioTime = 0;
        };
        this._audioTime = t;
    }

    pause() {
        if (!this._currentAudioSource) {
            return;
        }

        if (this._currentAudioSource.paused) {
            this.start(this.currentTime);
        } else {
            this._currentAudioSource.stop();
            this._audioTime = this._audioCtx.currentTime - this._currentAudioSource.start_time;
        }
    }

    seek(t) {
        if (!this._currentAudioSource) {
            return;
        }

        this._currentAudioSource.stop();
        this.start(t);
    }

    stop() {
        if (!this._currentAudioSource) {
            return;
        }

        this._currentAudioSource.stop();
    }

    get_chart_time() {
        return this._audioCtx.currentTime - this._currentAudioSource.start_time;
    }

    render() {
        if (!this._currentAudioSource) {
            return;
        }

        this._audioTime = this.get_chart_time();
        this._cvctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        this.#call_wasm("h5bind_render", this._ctx, this._audioTime);
    }
};

class MilImgDecoder {
    constructor(options) {
        options = options || {};

        if (!options.buildDirectory) {
            throw new Error("No buildDirectory specified");
        }

        this._buildDirectory = options.buildDirectory;
    }

    async init() {
        const module = await import(_solve_wasm_path(this._buildDirectory));
        this._instance = await module.default();
    }

    #call_wasm(func, ...args) {
        return this._instance["_" + func](...args);
    }

    #read_u32(ptr) {
        return new DataView(this._instance.HEAPU8.buffer, ptr, 4).getUint32(0, true);
    }

    #read_u64(ptr) {
        return new DataView(this._instance.HEAPU8.buffer, ptr, 8).getBigUint64(0, true);
    }

    async load(milimg) {
        milimg = await _normToUint8Array(milimg);

        const dataPtr = this.#call_wasm("malloc", milimg.byteLength);
        new Uint8Array(this._instance.HEAPU8.buffer, dataPtr, milimg.byteLength).set(milimg);

        const ptr = this.#call_wasm("h5bind_load_milimg", dataPtr, BigInt(milimg.byteLength));
        this.#call_wasm("free", dataPtr);

        return ptr;
    }

    get_info(ptr) {
        const info_size = 4 * 3;
        const info_ptr = this.#call_wasm("malloc", info_size);
        this.#call_wasm(
            "h5bind_get_milimg_info",
            ptr,
            info_ptr,
            info_ptr + 4,
            info_ptr + 8
        );

        const version = this.#read_u32(info_ptr);
        const width = this.#read_u32(info_ptr + 4);
        const height = this.#read_u32(info_ptr + 8);

        this.#call_wasm("free", info_ptr);

        return { version, width, height };
    }

    decode(ptr) {
        const info_size = 8 * 3;
        const info_ptr = this.#call_wasm("malloc", info_size);
        const decoded_ptr = this.#call_wasm(
            "h5bind_decode_milimg",
            ptr,
            info_ptr,
            info_ptr + 8,
            info_ptr + 16
        );

        const width = parseInt(this.#read_u64(info_ptr));
        const height = parseInt(this.#read_u64(info_ptr + 8));
        const size = parseInt(this.#read_u64(info_ptr + 16));

        const data = new Uint8Array(this._instance.HEAPU8.buffer, decoded_ptr, size).slice();

        this.#call_wasm("free", decoded_ptr);
        this.#call_wasm("free", info_ptr);

        return { width, height, data };
    }

    free(ptr) {
        this.#call_wasm("h5bind_release_milimg", ptr);
    }
};

export default {
    MilLunePlayer,
    MilImgDecoder
};
