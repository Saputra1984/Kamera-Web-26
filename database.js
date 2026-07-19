// database.js - Pusat Data, Kontrol Booster, dan Cetak Biru (Blueprint) Aplikasi "Ai Picture"
window.APP_DATABASE = {
  "app_config": {
    "metadata": { 
      "application_name": "Ai Picture", 
      "version": "1.0.0" 
    },
    "settings": { 
      "default_format_foto": "webp_max", 
      "default_format_video": "video_webm",
      "default_sharpness": "max", 
      "default_color_mode": "natural",
      "default_facing": "environment", 
      "aspect_ratio": "4:3", 
      "orientation_lock": "forced_portrait",
      "stability_mode": "hardware_assisted",
      "theme": "dark_void",
      "background_color": "#000000"
    }
  },

  // Menyediakan wadah penyimpanan dinamis untuk slider booster agar tidak error di brain.js
  "active_settings": {
    "normal_exposure": -0.5,
    "ketajaman_level": 1.0,
    "jendela_exposure": -1.5,
    "kain_intensity": 1.4,
    "text_sharpness": 2.2,
    "ir_gain": 1.8,
    "night_brightness": 1.3,
    "object_edge": 1.0,
    "zoom_level": 1.5,
    "default_exposure": 0.0
  },

  "viewport_adaptation": {
    "portrait": {
      "video_css": "width: 100%; height: 100%; object-fit: cover; transition: all 0.4s ease;"
    },
    "landscape": {
      "video_css": "width: 100%; height: 100%; object-fit: contain; transition: all 0.4s ease;"
    }
  },

  "navigation_buttons": {
    // ZONA ATAS (Menu Titik Tiga)
    "triple_dot_btn": {
      "id": "triple_dot_btn",
      "type": "trigger",
      "action": "toggleMenuBox",
      "label": "⋮",
      "allow_rotation": true,
      "rotation_mode": "icon_only",
      "ui_coordinate": { 
        "position": "absolute", "top": "15px", "right": "15px", "z-index": "15", 
        "font-size": "28px", "background": "transparent", "color": "#ffffff",
        "width": "40px", "height": "40px", "display": "flex", "align-items": "center", "justify-content": "center"
      },
      "transition": "transform 0.3s ease"
    },

    // ZONA TENGAH KIRI - WADAH KOKOH & SLIDER BOOSTER (Vertikal Tetap Permanen)
    "left_slider_container": {
      "id": "left_slider_container",
      "type": "container",
      "allow_rotation": false, 
      "ui_coordinate": {
        "position": "absolute", 
        "top": "50%",                  
        "transform": "translateY(-50%)", 
        "left": "15px", 
        "z-index": "15",
        "width": "42px", 
        "height": "240px",             
        "background": "rgba(255, 255, 255, 0.05)", 
        "border": "1px solid rgba(255, 255, 255, 0.1)", 
        "border-radius": "20px",
        "display": "flex", 
        "align-items": "center", 
        "justify-content": "center",
        "box-shadow": "0 4px 12px rgba(0,0,0,0.5)"
      }
    },
    "expSlider": {
      "id": "expSlider",
      "type": "slider",
      "parent_id": "left_slider_container",
      "action": "setExposure", // Disamakan dengan case action di brain.js
      "ui_coordinate": { 
        "width": "20px",               
        "height": "200px",             
        "-webkit-appearance": "slider-vertical", 
        "background": "transparent", 
        "outline": "none",
        "cursor": "pointer"
      }
    },

    // ZONA TENGAH LAINNYA
    "timer_btn": {
      "id": "timer_btn",
      "type": "trigger",
      "action": "cycleTimer",
      "label": "⏱️",
      "allow_rotation": true,
      "rotation_mode": "layout_follow",
      "ui_coordinate": { 
        "position": "absolute", 
        "top": "15%",                  
        "left": "15px", 
        "z-index": "15", 
        "width": "42px", 
        "height": "42px", 
        "background": "rgba(255,255,255,0.2)", 
        "color": "#fff", 
        "border-radius": "50%",
        "display": "flex",
        "align-items": "center",
        "justify-content": "center"
      }
    },

    // ZONA BAWAH (Posisi Tetap di Bawah, Hanya Ikon Berputar)
    "gallery_preview": { 
      "id": "gallery_preview", "type": "trigger", "action": "openGallery", "label": "🖼️",
      "allow_rotation": true, "rotation_mode": "icon_only",
      "ui_coordinate": { 
        "position": "absolute", "bottom": "25px", "left": "40px", "z-index": "15", 
        "width": "52px", "height": "52px", "background": "rgba(255,255,255,0.2)", 
        "border": "2px solid #fff", "border-radius": "8px", "display": "flex", "align-items": "center", "justify-content": "center", "font-size": "22px"
      },
      "transition": "transform 0.3s ease"
    },
    "shutter_btn": { 
      "id": "shutter_btn", "type": "trigger", "action": "capture", "label": "⚪",
      "allow_rotation": true, "rotation_mode": "icon_only",
      "ui_coordinate": { 
        "position": "absolute", "bottom": "15px", "left": "50%", "transform": "translateX(-50%)", "z-index": "15", 
        "width": "72px", "height": "72px", "background": "#ffffff", "border-radius": "50%", "border": "4px solid rgba(0,0,0,0.3)",
        "display": "flex", "align-items": "center", "justify-content": "center", "font-size": "24px"
      },
      "transition": "transform 0.3s ease"
    },
    "right_actions_container": {
      "id": "right_actions_container",
      "type": "container",
      "allow_rotation": true,
      "rotation_mode": "icon_only", 
      "ui_coordinate": { 
        "position": "absolute", "bottom": "15px", "right": "30px", "z-index": "15", 
        "display": "flex", "flex-direction": "column", "gap": "12px", "width": "50px", "height": "auto"
      },
      "child_buttons": [
        { "id": "switch_camera", "type": "toggle", "action": "switchCamera", "label": "🔄", "width": "46px", "height": "46px", "background": "rgba(255,255,255,0.2)", "color": "#fff", "border-radius": "50%" },
        { "id": "switch_mode", "type": "toggle", "action": "switchMode", "label": "📸", "width": "46px", "height": "46px", "background": "rgba(255,255,255,0.2)", "color": "#fff", "border-radius": "50%" }
      ]
    },
    "dropdownMenu": {
      "id": "dropdownMenu", "type": "menu_box",
      "ui_coordinate": { 
        "position": "absolute", "top": "60px", "right": "15px", "z-index": "20", "width": "220px", "max-height": "250px", 
        "overflow-y": "auto", "display": "none", "background": "rgba(10,10,10,0.95)", "border": "1px solid #222", "border-radius": "8px", "padding": "12px", "flex-direction": "column"
      }
    },
    "focus-box": {
      "id": "focus-box",
      "type": "indicator",
      "ui_coordinate": {
        "position": "absolute",
        "width": "70px",
        "height": "70px",
        "border": "2px dashed #ffeb3b",
        "border-radius": "4px",
        "display": "none",
        "pointer-events": "none",
        "z-index": "5",
        "transform": "translate(-50%, -50%) scale(1.3)"
      },
      "transition": "transform 0.15s ease-out, opacity 0.2s ease-out"
    }
  },

  "shutter_pipeline": {
    "visual_effects": {
      "flash_screen_css": "position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #ffffff; z-index: 99; opacity: 0; transition: opacity 0.1s ease;",
      "flash_duration_ms": 150,
      "button_cooldown_ms": 1000 
    },
    
    "processing_profiles": {
      "webp_max": {
        "mime_type": "image/webp",
        "quality": 1.0,
        "extension": "webp",
        "apply_ai_enhancement": true,
        "max_canvas_width": 1920 
      },
      "webp": {
        "mime_type": "image/webp",
        "quality": 0.85,
        "extension": "webp",
        "apply_ai_enhancement": true,
        "max_canvas_width": 1280
      },
      "jpeg_hr": {
        "mime_type": "image/jpeg",
        "quality": 0.95,
        "extension": "jpg",
        "apply_ai_enhancement": true,
        "max_canvas_width": 1920
      },
      "jpeg": {
        "mime_type": "image/jpeg",
        "quality": 0.80,
        "extension": "jpg",
        "apply_ai_enhancement": false,
        "max_canvas_width": 1280
      },
      "png": {
        "mime_type": "image/png",
        "quality": 1.0,
        "extension": "png",
        "apply_ai_enhancement": false,
        "max_canvas_width": 1280
      },
      "pdf": {
        "mime_type": "application/pdf",
        "quality": 1.0,
        "extension": "pdf",
        "apply_ai_enhancement": true,
        "max_canvas_width": 1920
      }
    },

    "storage_policy": {
      "save_to_local_storage": true,
      "max_history_items": 5, 
      "compress_thumbnail_quality": 0.3
    }
  },

  "camera_hardware_config": {
    "ideal_width": 1280,
    "ideal_height": 720,
    "aspect_ratio": 1.7777777778, 
    "min_exposure": -2.0,         
    "max_exposure": 2.0,          
    "default_exposure": 0.0
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
    },
    "burst_mode": {
        "frame_count": 3,
        "interval_ms": 15,
        "jpeg_quality": 0.8
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
      "squint_aperture_ratio_y": 1.0,
      "center_sharpness_boost": 1.0,
      "vignette_shadow_alpha": 0.0
    }
  },

  "menu_titik_tiga": [
    {
      "id": "group_format_foto",
      "label": "📸 Format Ekspor Foto",
      "type": "parent_menu",
      "sub_menu": [
        {"id": "fmt_webp", "label": "Format: WebP (Rekomendasi)", "action": "setFormat", "value": "webp"},
        {"id": "fmt_jpeg", "label": "Format: JPEG (Universal)", "action": "setFormat", "value": "jpeg"},
        {"id": "fmt_png",  "label": "Format: PNG (Tanpa Kompresi)", "action": "setFormat", "value": "png"},
        {"id": "fmt_pdf",  "label": "Format: PDF (Dokumen)", "action": "setFormat", "value": "pdf"}
      ]
    },
    {
      "id": "group_format_video",
      "label": "🎥 Format Ekspor Video",
      "type": "parent_menu",
      "sub_menu": [
        {"id": "fmt_vid_mp4", "label": "Format: MP4 (Standar)", "action": "setFormat", "value": "video_mp4"},
        {"id": "fmt_vid_webm", "label": "Format: WebM (Ekstrem)", "action": "setFormat", "value": "video_webm"}
      ]
    },
    {
      "id": "group_kualitas",
      "label": "⚡ Kualitas File Ekspor",
      "type": "parent_menu",
      "sub_menu": [
        {"id": "qual_low", "label": "Kualitas: Low (Hemat Ruang)", "action": "setExportQuality", "value": "low"},
        {"id": "qual_std", "label": "Kualitas: Standar (Rekomendasi)", "action": "setExportQuality", "value": "standar"},
        {"id": "qual_high", "label": "Kualitas: High (Sangat Tajam)", "action": "setExportQuality", "value": "high"}
      ]
    },
    {
      "id": "group_fitur_rekonstruksi_ai",
      "label": "🧠 Mode Rekonstruksi AI",
      "type": "parent_menu",
      "sub_menu": [
        {"id": "rec_normal",  "label": "📷 Mode: Normal", "action": "setActiveFeature", "value": "normal"},
        {"id": "rec_ketajaman", "label": "✨ Mode: Ketajaman Ekstrem", "action": "setActiveFeature", "value": "ketajaman"},
        {"id": "rec_jendela", "label": "🪟 Redam Silau Jendela", "action": "setActiveFeature", "value": "jendela"},
        {"id": "rec_kain",    "label": "👕 Redam Silau / Serat Kain", "action": "setActiveFeature", "value": "kain"},
        {"id": "rec_teks",    "label": "📄 Deteksi Serat & Teks", "action": "setActiveFeature", "value": "teks"},
        {"id": "rec_gelap",   "label": "🟢 Simulasi Infra-Red", "action": "setActiveFeature", "value": "gelap"},
        {"id": "rec_malam",   "label": "🌙 Mode: Malam HDR", "action": "setActiveFeature", "value": "malam"},
        {"id": "rec_objek",   "label": "🎯 Fokus Batas Pola Objek", "action": "setActiveFeature", "value": "objek"},
        {"id": "rec_zoom",    "label": "🔍 Mode: Super Zoom", "action": "setActiveFeature", "value": "zoom"}
      ]
    }
  ],

  "slider_booster_routing": {
    "registry": {
      "normal": {
        "name": "Kecerahan Sensor (Exposure)",
        "min": -3.0, "max": 1.0, "step": 0.1, "default_value": -0.5,
        "target_database_path": "active_settings.normal_exposure",
        "realtime_feedback_formula": "brightness"
      },
      "ketajaman": {
        "name": "Intensitas Ketajaman Kamera",
        "min": 0.0, "max": 2.5, "step": 0.1, "default_value": 1.0,
        "target_database_path": "active_settings.ketajaman_level",
        "realtime_feedback_formula": "convolution_intensity"
      },
      "jendela": {
        "name": "Redam Silau Jendela",
        "min": -2.0, "max": -0.5, "step": 0.1, "default_value": -1.5,
        "target_database_path": "active_settings.jendela_exposure",
        "realtime_feedback_formula": "glare_cut"
      },
      "kain": {
        "name": "Intensitas Detail Serat",
        "min": 0.5, "max": 2.5, "step": 0.1, "default_value": 1.4,
        "target_database_path": "active_settings.kain_intensity",
        "realtime_feedback_formula": "convolution_intensity"
      },
      "teks": {
        "name": "Penajam Batas Karakter",
        "min": 1.0, "max": 3.0, "step": 0.1, "default_value": 2.2,
        "target_database_path": "active_settings.text_sharpness",
        "realtime_feedback_formula": "convolution_intensity"
      },
      "gelap": {
        "name": "Sensitivitas Cahaya (ISO Gain)",
        "min": 1.0, "max": 2.5, "step": 0.1, "default_value": 1.8,
        "target_database_path": "active_settings.ir_gain",
        "realtime_feedback_formula": "chroma_lock"
      },
      "malam": {
        "name": "Kecerahan Area Gelap",
        "min": 1.0, "max": 2.0, "step": 0.1, "default_value": 1.3,
        "target_database_path": "active_settings.night_brightness",
        "realtime_feedback_formula": "brightness"
      },
      "objek": {
        "name": "Ketegasan Batas Pola",
        "min": 0.5, "max": 2.0, "step": 0.1, "default_value": 1.0,
        "target_database_path": "active_settings.object_edge",
        "realtime_feedback_formula": "kernel_multiplier"
      },
      "zoom": {
        "name": "Ketajaman Super Zoom AI",
        "min": 1.0, "max": 3.0, "step": 0.1, "default_value": 0.5,
        "target_database_path": "active_settings.zoom_level",
        "realtime_feedback_formula": "zoom_transform" 
      },
      "default": {
        "name": "Kecerahan Kamera",
        "min": -1.0, "max": 1.0, "step": 0.1, "default_value": 0.0,
        "target_database_path": "active_settings.default_exposure",
        "realtime_feedback_formula": "brightness"
      }
    }
  },

  "ai_reconstruction_profiles": {
    "normal": {
      "glare_threshold": 220,
      "shadow_lift": 1.0,
      "edge_boost_multiplier": 0.5,
      "saturation": 1.0
    },
    "natural": {
      "glare_threshold": 245,
      "shadow_lift": 1.15,
      "edge_boost_multiplier": 0.3,
      "saturation": 0.95
    },
    "kain": {
      "glare_threshold": 190,
      "shadow_lift": 1.2,
      "edge_boost_multiplier": 1.2,
      "saturation": 1.0
    },
    "jendela": {
      "glare_threshold": 160,
      "shadow_lift": 1.1,
      "edge_boost_multiplier": 0.8,
      "saturation": 1.0
    },
    "teks": {
      "glare_threshold": 200,
      "shadow_lift": 0.9,
      "edge_boost_multiplier": 1.8,
      "saturation": 0.4
    },
    "gelap": {
      "glare_threshold": 255,
      "shadow_lift": 1.2,
      "edge_boost_multiplier": 0.0,
      "saturation": 1.0
    },
    "malam": {
      "glare_threshold": 240,
      "shadow_lift": 1.4,
      "edge_boost_multiplier": 0.6,
      "saturation": 1.0
    },
    "objek": {
      "glare_threshold": 220,
      "shadow_lift": 1.1,
      "edge_boost_multiplier": 1.0,
      "saturation": 1.0
    },
    "zoom": {
      "glare_threshold": 180,
      "shadow_lift": 0.1,
      "edge_boost_multiplier": 1.5,
      "saturation": 1.0
    }
  }
};
