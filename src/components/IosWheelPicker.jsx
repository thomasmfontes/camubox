import React, { useState, useEffect, useRef } from 'react';
import './IosWheelPicker.css';

const IosWheelPicker = ({ value, min = 1, max = 12, onChange }) => {
    const containerRef = useRef(null);
    const [localActiveItem, setLocalActiveItem] = useState(value);
    
    const isDragRef = useRef(false);
    const wasDraggedRef = useRef(false);
    const startYRef = useRef(0);
    const scrollTopRef = useRef(0);
    const scrollTimeoutRef = useRef(null);
    const itemHeight = 36; // px

    const items = [];
    for (let i = min; i <= max; i++) {
        items.push(i);
    }

    // Update local state and scroll position when value changes from parent (e.g. presets)
    useEffect(() => {
        setLocalActiveItem(value);
        const container = containerRef.current;
        if (container) {
            const targetScrollTop = (value - min) * itemHeight;
            // Check if we are already close to target scroll position to avoid jittering
            if (Math.abs(container.scrollTop - targetScrollTop) > 3) {
                container.scrollTo({
                    top: targetScrollTop,
                    behavior: 'smooth'
                });
            }
        }
    }, [value, min]);

    // Handle scroll events with local fast update + debounced parent update
    const handleScroll = (e) => {
        const scrollTop = e.target.scrollTop;
        const newIndex = Math.round(scrollTop / itemHeight) + min;
        const targetIndex = Math.max(min, Math.min(max, newIndex));

        // Update local selected state immediately for 60fps styling updates (scale, opacity)
        if (targetIndex !== localActiveItem) {
            setLocalActiveItem(targetIndex);
        }

        // Debounce parent state update so lagginess is avoided during continuous scrolling
        if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
        }

        // Trigger parent state update only when scrolling settles
        scrollTimeoutRef.current = setTimeout(() => {
            if (targetIndex !== value && !isDragRef.current) {
                onChange(targetIndex);
            }
        }, 120); // Fast but stable debounce
    };

    // Drag to scroll for desktop mouse support
    const handleMouseDown = (e) => {
        isDragRef.current = true;
        wasDraggedRef.current = false;
        startYRef.current = e.pageY;
        scrollTopRef.current = containerRef.current.scrollTop;
        containerRef.current.style.scrollSnapType = 'none'; // Temporarily disable snap
        containerRef.current.style.cursor = 'grabbing';
    };

    const handleMouseMove = (e) => {
        if (!isDragRef.current) return;
        e.preventDefault();
        const deltaY = e.pageY - startYRef.current;
        if (Math.abs(deltaY) > 5) {
            wasDraggedRef.current = true;
        }
        const walk = deltaY * 1.5; // Drag scroll velocity
        containerRef.current.scrollTop = scrollTopRef.current - walk;
    };

    const handleMouseUpOrLeave = () => {
        if (!isDragRef.current) return;
        isDragRef.current = false;
        containerRef.current.style.cursor = 'grab';
        containerRef.current.style.scrollSnapType = 'y mandatory'; // Re-enable snap

        // Snap to nearest item smoothly
        const scrollTop = containerRef.current.scrollTop;
        const newIndex = Math.round(scrollTop / itemHeight) + min;
        const targetIndex = Math.max(min, Math.min(max, newIndex));
        
        containerRef.current.scrollTo({
            top: (targetIndex - min) * itemHeight,
            behavior: 'smooth'
        });
        
        setLocalActiveItem(targetIndex);
        
        if (targetIndex !== value) {
            onChange(targetIndex);
        }
    };

    const handleItemClick = (item) => {
        if (wasDraggedRef.current) return; // Prevent click action if the picker was dragged
        
        setLocalActiveItem(item);
        onChange(item);
        // Scroll to clicked item smoothly
        const container = containerRef.current;
        if (container) {
            container.scrollTo({
                top: (item - min) * itemHeight,
                behavior: 'smooth'
            });
        }
    };

    // Clean up timeout on unmount
    useEffect(() => {
        return () => {
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }
        };
    }, []);

    return (
        <div className="ios-picker-wrapper">
            {/* Selection indicator overlay lines */}
            <div className="ios-picker-selection-indicator"></div>
            
            <div 
                ref={containerRef}
                className="ios-picker-container"
                onScroll={handleScroll}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUpOrLeave}
                onMouseLeave={handleMouseUpOrLeave}
                style={{ cursor: 'grab' }}
            >
                {/* Spacer to align first item in the center */}
                <div className="ios-picker-spacer"></div>
                
                {items.map((item) => {
                    const isActive = item === localActiveItem;
                    const diff = Math.abs(item - localActiveItem);
                    
                    // Smooth visual transitions based on proximity to selected index
                    const scale = Math.max(0.72, 1 - diff * 0.1);
                    const opacity = Math.max(0.3, 1 - diff * 0.28);
                    const rotateX = diff * -16 * Math.sign(item - localActiveItem);

                    return (
                        <div 
                            key={item}
                            className={`ios-picker-item ${isActive ? 'active' : ''}`}
                            onClick={() => handleItemClick(item)}
                            style={{
                                height: `${itemHeight}px`,
                                transform: `perspective(180px) rotateX(${rotateX}deg) scale(${scale})`,
                                opacity: opacity,
                                transition: 'transform 0.15s ease-out, opacity 0.15s ease-out, color 0.15s ease-out'
                            }}
                        >
                            {item === 1 ? '1 parcela (à vista)' : `${item} parcelas`}
                        </div>
                    );
                })}

                {/* Spacer to align last item in the center */}
                <div className="ios-picker-spacer"></div>
            </div>
        </div>
    );
};

export default IosWheelPicker;
