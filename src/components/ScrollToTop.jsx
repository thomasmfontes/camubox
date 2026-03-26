import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Component that automatically scrolls the window to the top (0,0) 
 * whenever the location (URL) changes.
 */
const ScrollToTop = () => {
    const { pathname } = useLocation();

    useEffect(() => {
        // Scroll to top immediately
        window.scrollTo(0, 0);
        
        // Also scroll on the next frame to catch any layout shifts or browser overrides
        const animFrame = requestAnimationFrame(() => {
            window.scrollTo(0, 0);
        });

        return () => cancelAnimationFrame(animFrame);
    }, [pathname]);

    return null; // This component doesn't render anything
};

export default ScrollToTop;
