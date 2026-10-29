"use strict";
const downloadLinks = Array.from(document.querySelectorAll('.download-link'));
const releaseLabels = Array.from(document.querySelectorAll('.release-label'));
const downloadState = document.querySelector('.download-state');
function setDownloadState(message) {
    if (downloadState)
        downloadState.textContent = message;
}
async function loadRelease() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/gabewinstead/SpxtifyMediaVisuals/main/latest.json', { cache: 'no-store' });
        if (!response.ok)
            throw new Error(`Release manifest returned ${response.status}`);
        const release = await response.json();
        const windowsUrl = release.platforms?.['windows-x86_64']?.url;
        if (!windowsUrl)
            throw new Error('Windows installer URL is missing');
        downloadLinks.forEach((link) => { link.href = windowsUrl; });
        releaseLabels.forEach((label) => { label.textContent = release.version ? `Version ${release.version}` : 'Latest release'; });
        setDownloadState(release.version ? `Latest version ${release.version} · Signed Windows installer` : 'Signed Windows installer');
    }
    catch (error) {
        console.warn('Could not load release metadata:', error);
        setDownloadState('Latest release available on GitHub');
    }
}
document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
        const targetId = link.getAttribute('href')?.slice(1);
        const target = targetId ? document.getElementById(targetId) : null;
        if (!target)
            return;
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});
void loadRelease();
