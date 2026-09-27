//! Windows only: embed the icon Explorer and the taskbar show, and the
//! manifest (per-monitor DPI awareness, UTF-8, common controls v6), into
//! blygger.exe. Other targets need nothing here.

use std::path::PathBuf;

fn main() {
    let packaging =
        PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("../../packaging");
    let icon = packaging.join("Blygger.ico");
    let manifest = packaging.join("Blygger.exe.manifest");
    println!("cargo:rerun-if-changed={}", icon.display());
    println!("cargo:rerun-if-changed={}", manifest.display());
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }
    // Absolute paths, so neither rc.exe nor windres has to guess what a
    // relative one is relative to.
    let quoted = |p: PathBuf| {
        let p = p.canonicalize().unwrap_or(p);
        format!("\"{}\"", p.display().to_string().replace('\\', "\\\\"))
    };
    let rc = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("blygger.rc");
    std::fs::write(
        &rc,
        format!("1 ICON {}\n1 24 {}\n", quoted(icon), quoted(manifest)),
    )
    .unwrap();
    embed_resource::compile(&rc, embed_resource::NONE)
        .manifest_required()
        .unwrap();
}
