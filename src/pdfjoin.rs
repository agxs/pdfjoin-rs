use std::{error::Error, io, path::Path, process::Command};

use tempfile::NamedTempFile;

pub fn join(file1: &Path, file2: &Path) -> Result<NamedTempFile, Box<dyn Error>> {
    let output_file = NamedTempFile::new()?;
    let output = Command::new("pdfunite")
        .arg(file1)
        .arg(file2)
        .arg(output_file.path())
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(Box::new(io::Error::other(format!(
            "pdfunite failed {}:\n\n{}",
            output.status, stderr
        ))));
    }

    Ok(output_file)
}
