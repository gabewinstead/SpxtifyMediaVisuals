"use strict";
const downloadLinks = Array.from(document.querySelectorAll('.download-link'));
const androidDownloadLinks = Array.from(document.querySelectorAll('.android-download-link'));
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
        const githubRelease = await fetch('https://api.github.com/repos/gabewinstead/SpxtifyMediaVisuals/releases/latest', { cache: 'no-store' });
        if (!githubRelease.ok)
            throw new Error(`GitHub release returned ${githubRelease.status}`);
        const releaseDetails = await githubRelease.json();
        const androidAsset = releaseDetails.assets?.find((asset) => asset.name.toLowerCase().endsWith('.apk'));
        downloadLinks.forEach((link) => { link.href = windowsUrl; });
        androidDownloadLinks.forEach((link) => {
            link.href = androidAsset?.browser_download_url ?? releaseDetails.html_url;
        });
        releaseLabels.forEach((label) => { label.textContent = release.version ? `Version ${release.version}` : 'Latest release'; });
        setDownloadState(release.version ? `Latest version ${release.version} · Windows installer and Android APK` : 'Windows installer and Android APK');
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
