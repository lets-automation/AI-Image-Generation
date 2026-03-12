"use client";

import React, { useState, useRef, useLayoutEffect, cloneElement } from "react";

type NavItem = {
    id: string | number;
    icon: React.ReactElement;
    label?: string;
    onClick?: () => void;
};

type LimelightNavProps = {
    items: NavItem[];
    activeIndex: number;
    onTabChange?: (index: number) => void;
    className?: string;
    limelightClassName?: string;
    iconContainerClassName?: string;
    iconClassName?: string;
};

/**
 * An adaptive-width navigation bar with a "limelight" effect
 * that highlights the active item with a glowing top indicator.
 */
export const LimelightNav = ({
    items,
    activeIndex,
    onTabChange,
    className,
    limelightClassName,
    iconContainerClassName,
    iconClassName,
}: LimelightNavProps) => {
    const [isReady, setIsReady] = useState(false);
    const navItemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
    const limelightRef = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        if (items.length === 0) return;

        const limelight = limelightRef.current;
        const activeItem = navItemRefs.current[activeIndex];

        if (limelight && activeItem) {
            const itemWidth = activeItem.offsetWidth * 0.6;
            limelight.style.width = `${itemWidth}px`;
            const newLeft = activeItem.offsetLeft + (activeItem.offsetWidth - itemWidth) / 2;
            limelight.style.left = `${newLeft}px`;

            if (!isReady) {
                setTimeout(() => setIsReady(true), 50);
            }
        }
    }, [activeIndex, isReady, items]);

    if (items.length === 0) {
        return null;
    }

    const handleItemClick = (index: number, itemOnClick?: () => void) => {
        onTabChange?.(index);
        itemOnClick?.();
    };

    return (
        <nav
            className={`relative inline-flex items-center h-14 rounded-xl bg-card text-foreground border border-border px-1 ${className ?? ""}`}
        >
            {items.map(({ id, icon, label, onClick }, index) => (
                <a
                    key={id}
                    ref={(el) => {
                        navItemRefs.current[index] = el;
                    }}
                    className={`relative z-20 flex h-full cursor-pointer items-center justify-center gap-2 px-4 transition-all duration-200 ${activeIndex === index
                        ? "opacity-100"
                        : "opacity-35 hover:opacity-60"
                        } ${iconContainerClassName ?? ""}`}
                    onClick={() => handleItemClick(index, onClick)}
                    aria-label={label}
                    title={label}
                >
                    {cloneElement(icon, {
                        className: `w-4 h-4 flex-shrink-0 ${icon.props.className || ""} ${iconClassName || ""}`,
                    })}
                    {label && (
                        <span className="text-[13px] font-medium whitespace-nowrap">
                            {label}
                        </span>
                    )}
                </a>
            ))}

            <div
                ref={limelightRef}
                className={`absolute top-0 z-10 h-[4px] rounded-full bg-primary shadow-[0_40px_12px_var(--primary)] ${isReady ? "transition-[left,width] duration-400 ease-in-out" : ""
                    } ${limelightClassName ?? ""}`}
                style={{ left: "-999px", width: "40px" }}
            >
                <div className="absolute left-[-15%] top-[4px] w-[130%] h-12 [clip-path:polygon(5%_100%,25%_0,75%_0,95%_100%)] bg-gradient-to-b from-primary/25 to-transparent pointer-events-none" />
            </div>
        </nav>
    );
};
