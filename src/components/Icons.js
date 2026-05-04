// src/components/Icons.js

import React from 'react';

const Icon = ({ name, className = "" }) => {
    let svgContent = "";
    switch (name) {
        case "wallet": svgContent = `<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h12a2 2 0 0 1 0 4H5a2 2 0 0 0 0 4h12c1.07 0 2.2-0.87 2.2-2L22 13V7Z"></path><path d="M2 7v10a2 2 0 0 0 2 2h16"></path>`; break;
        case "land-plot": svgContent = `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path><path d="M14 2v6h6"></path><path d="M16 13H8"></path><path d="M16 17H8"></path><path d="M10 9H8"></path>`; break;
        case "map-pin": svgContent = `<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"></path><circle cx="12" cy="9" r="3"></circle>`; break;
        case "square": svgContent = `<rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>`; break;
        case "plus-circle": svgContent = `<circle cx="12" cy="12" r="10"></circle><line x1="12" x2="12" y1="8" y2="16"></line><line x1="8" x2="16" y1="12" y2="12"></line>`; break;
        case "search": svgContent = `<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path>`; break;
        case "check-circle": svgContent = `<path d="M22 11.08V12a10 10 0 1 1-5.93-8.66"></path><path d="M22 4 12 14.01l-3-3"></path>`; break;
        case "x-circle": svgContent = `<circle cx="12" cy="12" r="10"></circle><line x1="15" x2="9" y1="9" y2="15"></line><line x1="9" x2="15" y1="9" y2="15"></line>`; break;
        case "arrow-right": svgContent = `<path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path>`; break; // Added for transfer
        case "banknote": svgContent = `<rect width="20" height="12" x="2" y="6" rx="2"></rect><circle cx="12" cy="12" r="2"></circle><path d="M6 10h.01"></path><path d="M18 10h.01"></path>`; break; // New icon for 'Funds' or 'Balance' related
        case "user-check": svgContent = `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><polyline points="16 11 18 13 22 9"></polyline>`; break; // New icon for owner
        case "building": svgContent = `<rect width="16" height="20" x="4" y="2" rx="2" ry="2"></rect><path d="M9.5 16h5"></path><path d="M9.5 12h5"></path><path d="M9.5 8h5"></path>`; break; // New icon for a "system" or "company"
        case "plus": svgContent = `<line x1="12" x2="12" y1="5" y2="19"></line><line x1="5" x2="19" y1="12" y2="12"></line>`; break; // Plus sign
        case "key": svgContent = `<path d="M16.6915026,12.4744748 L3.50612381,12.4744748 C3.19218622,12.4744748 3,12.2822733 3,11.8183807 L3,2.64507042 C3,2.34444886 3.34141803,2 3.50612381,2 L17.1346707,2 C17.1346707,2 17.1346707,2 17.1346707,2.05892208 L17.1346707,11.8183807 C17.1346707,12.2822733 17.1346707,12.4744748 16.6915026,12.4744748 Z"></path><path d="M3.5,7 L13,7"></path>`; break; // Key icon for admin management
        case "shield": svgContent = `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M9 12l2 2 4-4"></path>`; break; // Shield for security/validators
        case "users": svgContent = `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>`; break; // Multiple users/validators
        case "doc": svgContent = `<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline><line x1="9" x2="15" y1="13" y2="13"></line><line x1="9" x2="15" y1="17" y2="17"></line>`; break; // Document/form icon
        case "inbox": svgContent = `<polyline points="22 12 18 12 15 21 9 21 6 12 2 12"></polyline><path d="M6 5h12a1 1 0 0 1 1 1v5H5V6a1 1 0 0 1 1-1z"></path>`; break; // Inbox
        case "download": svgContent = `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" x2="12" y1="15" y2="3"></line>`; break; // Download
        case "alert-circle": svgContent = `<circle cx="12" cy="12" r="10"></circle><line x1="12" x2="12" y1="8" y2="12"></line><line x1="12" x2="12.01" y1="16" y2="16"></line>`; break; // Alert circle
        case "info": svgContent = `<circle cx="12" cy="12" r="10"></circle><line x1="12" x2="12" y1="16" y2="12"></line><line x1="12" x2="12.01" y1="8" y2="8"></line>`; break; // Info
        case "sun": svgContent = `<circle cx="12" cy="12" r="5"></circle><line x1="12" x2="12" y1="1" y2="3"></line><line x1="12" x2="12" y1="21" y2="23"></line><line x1="4.22" x2="5.64" y1="4.22" y2="5.64"></line><line x1="18.36" x2="19.78" y1="18.36" y2="19.78"></line><line x1="1" x2="3" y1="12" y2="12"></line><line x1="21" x2="23" y1="12" y2="12"></line><line x1="4.22" x2="5.64" y1="19.78" y2="18.36"></line><line x1="18.36" x2="19.78" y1="5.64" y2="4.22"></line>`; break; // Sun
        case "moon": svgContent = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`; break; // Moon
        case "x": svgContent = `<line x1="18" x2="6" y1="6" y2="18"></line><line x1="6" x2="18" y1="6" y2="18"></line>`; break; // X close button
        case "user-plus": svgContent = `<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" x2="20" y1="8" y2="14"></line><line x1="17" x2="23" y1="11" y2="11"></line>`; break; // User plus
        case "user": svgContent = `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>`; break; // User
        case "clock": svgContent = `<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>`; break; // Clock icon
    }
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            dangerouslySetInnerHTML={{ __html: svgContent }}
        />
    );
};

export default Icon;
