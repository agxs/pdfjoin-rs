use std::{error::Error, io, path::Path, process::Command};

use tempfile::NamedTempFile;

/// I: the passed in iterator type, eg Vec<&Path>
/// P: the type in the iterator, eg &Path
/// Items must be borrowable as Path
pub fn join<I, P>(files: I) -> Result<NamedTempFile, Box<dyn Error>>
where
    I: IntoIterator<Item = P>,
    P: AsRef<Path>,
{
    let files: Vec<P> = files.into_iter().collect();
    assert!(files.len() > 1);
    assert!(files.len() <= 20);

    let output_file = NamedTempFile::new()?;
    let output = Command::new("pdfunite")
        .args(files.iter().map(|p| p.as_ref()))
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
