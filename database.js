// database.js - Pusat Data dan Cetak Biru (Blueprint) Aplikasi "Ai Picture"
window.APP_DATABASE = {
  "app_config": {
    "metadata": { 
      "application_name": "Ai Picture", 
      "version": "1.0.0" 
    },
    "settings": { 
      "default_format": "webp_max", 
      "default_sharpness": "max", 
      "default_color_mode": "natural",
      "default_facing": "environment", 
      "aspect_ratio": "4:3", 
      "stability_mode": "hardware_assisted",
      "theme": "dark_void",
      "background_color": "#000000"
    }
  },

  "sharpness_modes": {
    "low": { "level": 3, "contrast_assist": 1.02, "desc": "Ketajaman Makro 3x (Serat Kain)" },
    "standar": { "level": 5, "contrast_assist": 1.05, "desc": "Ketajaman Tinggi 5x (Garis Tegas)" },
    "max": { "level": 10, "contrast_assist": 1.10, "desc": "Ketajaman Mikroskopis 10x (Detail Mikro)" }
  },

  "camera_features": {
    "zoom": { "current": 1, "max_hardware": "auto", "extreme_digital_multiplier": 4 },
    "exposure": { "current": 0, "min": -3, "max": 3, "step": 0.5 },
    "timer_options": [0, 3, 5, 10],
    "color_filters": {
      "asli": "saturate(1.0) contrast(1.0)",
      "fokus_warna": "saturate(1.8) contrast(1.1)",
      "natural": "saturate(1.1) contrast(0.95)",
      "malam": "saturate(1.2) contrast(1.3) brightness(1.6)",
      "teks": "saturate(1.05) contrast(1.12) brightness(1.02)"
    }
  },

  "auto_exposure_stabilizer": {
    "enabled": true,
    "analysis_interval_ms": 200,
    "target_luminance_sweet_spot": 128,
    "conditions": {
      "indoor_lowlight": {
        "trigger_luminance_below": 100,
        "adjust_filter": "brightness(1.18) contrast(1.05) saturate(1.05)",
        "anti_noise_blur": 0.3
      },
      "outdoor_bright": {
        "trigger_luminance_above": 200,
        "adjust_filter": "brightness(0.90) contrast(0.95)"
      },
      "backlight_siluet": {
        "detection_mode": "center_vs_edges_delta",
        "trigger_delta_above": 90,
        "adjust_filter": "brightness(1.30) contrast(1.15)",
        "force_layer": "shadow_lift"
      },
      "lamp_highlight": {
        "suppress_clipping": true,
        "max_white_threshold": 245
      },
      "anti_glare_jendela": {
        "base_brightness": 0.90,
        "max_dim_offset": 0.35,
        "base_contrast": 1.15,
        "max_contrast_offset": 0.25,
        "saturate": 1.10
      },
      "anti_glare_kain": {
        "base_brightness": 0.95,
        "max_dim_offset": 0.15,
        "base_contrast": 1.05,
        "max_contrast_offset": 0.10,
        "saturate": 1.02
      }
    }
  },

  "human_eye_perception_formula": {
    "enabled": true,
    "desc": "Algoritma Pemadatan RGB & Kompresi Logaritmik Sensor berbasis Biologis Mata Manusia",
    "luminance_weights_cie1931": { "r": 0.2126, "g": 0.7152, "b": 0.0722 },
    "tone_mapping": {
      "algorithm": "reinhard_modified",
      "trigger_glare_above": 190,
      "glare_dim_factor": 0.92,
      "max_clipping_safety": 245
    },
    "gamma_correction": { "curve_exponent": 2.2 },
    "squint_reflex_mechanism": {
      "enabled": true,
      "trigger_total_glare_pct": 0.15,
      "squint_aperture_ratio_y": 0.75,
      "center_sharpness_boost": 1.25,
      "vignette_shadow_alpha": 1.1
    }
  },

  // SLOT LOGIKA BARU: Menggantikan fungsi Teropong Lama
  "ai_vision_core": {
    "enabled": true,
    "mode": "hdr_biological_super_res",
    "local_contrast_strength": 1.35,  // Menaikkan ketajaman objek jauh (jendela/gedung)
    "glare_cut_threshold": 225,        // Batas deteksi cahaya silau jendela
    "shadow_lift_factor": 1.20,       // Mengangkat detail area gelap (dalam ruangan)
    "edge_boost_kernel": [
       0, -1,  0,
      -1,  5, -1,
       0, -1,  0
    ]
  },

  "navigation_buttons": {
    "gallery_preview": { 
      "id": "gallery_preview", 
      "type": "preview", 
      "action": "openGallery",
      "label": "",
      "ui_coordinate": { "position": "absolute", "bottom": "20px", "left": "20px", "z_index": "15", "width": "55px", "height": "55px", "background": "#222222", "border-radius": "8px" },
      "transition": "transform 0.3s ease"
    },
    "shutter_btn": { 
      "id": "shutter_btn", 
      "type": "trigger", 
      "action": "capture",
      "label": "",
      "ui_coordinate": { "position": "absolute", "bottom": "15px", "left": "50%", "transform": "translateX(-50%)", "z_index": "15", "width": "68px", "height": "68px", "background": "#ffffff", "border-radius": "50%" },
      "transition": "transform 0.3s ease"
    },
    "right_actions_container": {
      "id": "right_actions_container",
      "type": "container",
      "ui_coordinate": { "position": "absolute", "bottom": "15px", "right": "20px", "z_index": "15", "display": "flex", "flex-direction": "column", "gap": "10px" },
      "child_buttons": [
        { "id": "switch_camera", "type": "toggle", "action": "switchCamera", "label": "🔄", "width": "45px", "height": "45px", "background": "rgba(255,255,255,0.2)", "color": "#fff", "border-radius": "50%", "transition": "transform 0.3s ease" },
        { "id": "switch_mode", "type": "toggle", "action": "switchMode", "label": "📸", "width": "45px", "height": "45px", "background": "rgba(255,255,255,0.2)", "color": "#fff", "border-radius": "50%", "transition": "transform 0.3s ease" }
      ]
    },
    "timer_btn": {
      "id": "timer_btn",
      "type": "trigger",
      "action": "cycleTimer",
      "label": "⏱️",
      // Dipindahkan sedikit lebih ke atas (top: 20%) agar tidak tertekan oleh slider
      "ui_coordinate": { 
        "position": "absolute", 
        "top": "20%", 
        "left": "25px", 
        "z_index": "10", 
        "width": "45px", 
        "height": "45px", 
        "background": "rgba(255,255,255,0.2)", 
        "color": "#fff", 
        "border-radius": "50%" 
      }
    },
    "expSlider": {
      "id": "expSlider",
      "type": "slider",
      "action": "setExposure",
      "min": -3,
      "max": 3,
      "step": 0.5,
      // Menggunakan posisi tengah kiri (top: 50%) dengan transform-origin yang pas
      // Nilai 'display: block' diaktifkan agar slider muncul dan bisa Anda geser langsung
      "ui_coordinate": { 
        "position": "absolute", 
        "top": "50%", 
        "left": "25px", 
        "z_index": "10", 
        "transform": "rotate(-90deg) translateX(-50%)", 
        "transform-origin": "left center", 
        "width": "160px", 
        "display": "block",
        "margin": "0"
      }
    },

    "triple_dot_btn": {
      "id": "triple_dot_btn",
      "type": "trigger",
      "action": "toggleMenuBox",
      "label": "⋮",
      "ui_coordinate": { "position": "absolute", "top": "15px", "right": "15px", "z_index": "10", "font-size": "28px", "background": "transparent", "color": "#ffffff" },
      "transition": "transform 0.3s ease"
    },
    "dropdownMenu": {
      "id": "dropdownMenu",
      "type": "menu_box",
      "ui_coordinate": { 
        "position": "absolute", 
        "top": "60px", 
        "right": "15px", 
        "z_index": "20", 
        "width": "220px",
        "max-height": "60vh", 
        "overflow-y": "auto", 
        "display": "none", 
        "background": "rgba(10,10,10,0.95)", 
        "border": "1px solid #222",
        "border-radius": "8px", 
        "padding": "12px",
        "flex-direction": "column"
      }
    }
  },

  "menu_titik_tiga": [
    {
      "id": "group_foto",
      "label": "📸 Opsi Format Foto",
      "type": "parent_menu",
      "sub_menu": [
        {"id": "fmt_webp_max", "label": "Format: WebP Max (Lossless)", "action": "setFormat", "value": "webp_max"},
        {"id": "fmt_webp", "label": "Format: WebP", "action": "setFormat", "value": "webp"},
        {"id": "fmt_jpeg_hr", "label": "Format: JPEG High-Res", "action": "setFormat", "value": "jpeg_hr"},
        {"id": "fmt_jpeg", "label": "Format: JPEG", "action": "setFormat", "value": "jpeg"},
        {"id": "fmt_png",  "label": "Format: PNG",  "action": "setFormat", "value": "png"},
        {"id": "fmt_pdf",  "label": "Format: PDF",  "action": "setFormat", "value": "pdf"}
      ]
    },
    {
      "id": "group_video",
      "label": "🎥 Opsi Format Video",
      "type": "parent_menu",
      "sub_menu": [
        {"id": "fmt_vid_mp4", "label": "🎥 Video: MP4 (Standar)", "action": "setFormat", "value": "video_mp4"},
        {"id": "fmt_vid_webm", "label": "🎥 Video: WebM (Ekstrem)", "action": "setFormat", "value": "video_webm"}
      ]
    },
    {
      "id": "group_sharpness",
      "label": "✨ Opsi Ketajaman Mikroskopis",
      "type": "parent_menu",
      "sub_menu": [
        {"id": "sharp_low", "label": "Ketajaman: Low (3x)", "action": "setSharpness", "value": "low"},
        {"id": "sharp_std", "label": "Ketajaman: Standar (5x)", "action": "setSharpness", "value": "standar"},
        {"id": "sharp_max", "label": "Ketajaman: Max (10x Ekstrem)", "action": "setSharpness", "value": "max"}
      ]
    },
    {
      "id": "group_standalone_features",
      "label": "⚙️ Fitur Tambahan",
      "type": "direct_menu",
      "items": [
        {"id": "mode_malam", "label": "🌙 Mode: Malam", "action": "setColorMode", "value": "malam"},
        {"id": "mode_teks", "label": "📄 Mode: Fokus Serat & Teks", "action": "setColorMode", "value": "teks"},
        {"id": "mode_silau_jendela", "label": "🪟 Redam Silau Jendela", "action": "setAntiGlare", "value": "jendela"},
        {"id": "mode_silau_kain", "label": "👕 Redam Silau Kain", "action": "setAntiGlare", "value": "kain"},
        {"id": "mode_normal_silau", "label": "📷 Kembalikan Mode Normal", "action": "setAntiGlare", "value": "normal"},
        {"id": "mode_stabil", "label": "🛡️ Mode: Stabil Kamera", "action": "toggleStability", "value": "true"},
        {"id": "mode_fokus_kotak", "label": "🎯 Kotak Kunci Fokus: On/Off", "action": "toggleFocusBox", "value": "true"}
      ]
    }
  ],

  "javascript_blueprints": {
    "anti_crash_loading": {
      "desc": "Mencegah browser RAM 2GB force close saat mengolah WebP Max",
      "logic": "shutterBtn.disabled = true; shutterBtn.innerText = '⏳...'; setTimeout(execute_canvas, 50);"
    },
    "multi_frame_buffer": {
      "desc": "Membatasi riwayat foto di kiri bawah agar memori Chrome tidak meluap",
      "max_slots": 5,
      "logic": "cameraHistoryThumbs.unshift(base64Data); if(cameraHistoryThumbs.length > 5) cameraHistoryThumbs.pop();"
    },
    "magnetic_center_lock": {
      "desc": "Memaksa gambar pratinjau kembali tegak lurus di tengah layar hitam setelah di-zoom",
      "formulas": { "zoomScale": 1, "panX": 0, "panY": 0 },
      "css_override": "previewImg.style.transform = 'translate(0px, 0px) scale(1)'; previewImg.style.transition = 'none';"
    }
  }
};
