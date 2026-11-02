use prost::Message;
use std::path::PathBuf;
fn main() {
    let mut includes: Vec<PathBuf> = Vec::new();
    let mut files: Vec<PathBuf> = Vec::new();
    let mut out: Option<PathBuf> = None;
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        if a == "--version" { println!("libprotoc 30.2"); return; }
        if let Some(p) = a.strip_prefix("-I") { includes.push(if p.is_empty() { args.next().unwrap().into() } else { p.into() }); continue; }
        if let Some(p) = a.strip_prefix("--proto_path=") { includes.push(p.into()); continue; }
        if let Some(p) = a.strip_prefix("-o") { out = Some(if p.is_empty() { args.next().unwrap().into() } else { p.into() }); continue; }
        if let Some(p) = a.strip_prefix("--descriptor_set_out=") { out = Some(p.into()); continue; }
        if a.starts_with("--") { continue; }
        files.push(a.into());
    }
    let fds = protox::compile(&files, &includes).expect("compile");
    std::fs::write(out.expect("-o"), fds.encode_to_vec()).expect("write");
}
