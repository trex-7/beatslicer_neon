
import React, { useRef, useEffect, useState } from 'react';
import type { Slice, SequencerState, SliceType } from '../types';

declare const d3: any; // Using d3 from CDN

interface WaveformDisplayProps {
    audioBuffer: any; // Tone.AudioBuffer
    onScrub: (position: number) => void;
    isPlaying: boolean;
    playerRef: React.RefObject<any> | null;
    slices: Slice[];
    sequencer: SequencerState;
    selectedSliceIndex: number | null;
    onSliceSelect: (index: number) => void;
    onSliceToggle: (index: number) => void;
    onRegionSlice: (start: number, end: number) => void;
    onAutoSlice?: () => void;
    onPlaySlice: (index: number) => void;
    onSliceTypeChange: (index: number, type: SliceType) => void;
}

const WaveformDisplay: React.FC<WaveformDisplayProps> = ({ 
    audioBuffer, 
    onScrub, 
    isPlaying, 
    playerRef, 
    slices, 
    sequencer, 
    selectedSliceIndex,
    onSliceSelect,
    onSliceToggle,
    onRegionSlice,
    onPlaySlice,
    onSliceTypeChange
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [zoom, setZoom] = useState(1);
    const [containerWidth, setContainerWidth] = useState(0);

    // Track playback state for click handlers without forcing D3 redraws
    const isPlayingRef = useRef(isPlaying);
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

    // Drag Selection State
    const [dragStart, setDragStart] = useState<number | null>(null);
    const [dragCurrent, setDragCurrent] = useState<number | null>(null);

    // Handle container resize
    useEffect(() => {
        const resizeObserver = new ResizeObserver(entries => {
            if (!entries || !entries.length) return;
            const { width } = entries[0].contentRect;
            setContainerWidth(width);
        });

        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        return () => resizeObserver.disconnect();
    }, []);

    // Drag Logic
    useEffect(() => {
        const handleWindowMouseMove = (e: MouseEvent) => {
            if (dragStart !== null && svgRef.current) {
                 const rect = svgRef.current.getBoundingClientRect();
                 // Calculate X relative to SVG content
                 let x = e.clientX - rect.left;
                 // Clamp to visible width
                 x = Math.max(0, Math.min(x, rect.width));
                 setDragCurrent(x);
            }
        };

        const handleWindowMouseUp = (e: MouseEvent) => {
             if (dragStart !== null && svgRef.current && audioBuffer) {
                 const rect = svgRef.current.getBoundingClientRect();
                 let currentX = e.clientX - rect.left;
                 currentX = Math.max(0, Math.min(currentX, rect.width));
                 
                 const startX = Math.min(dragStart, currentX);
                 const endX = Math.max(dragStart, currentX);
                 
                 // Only trigger slice if drag distance is significant (> 5px)
                 // This prevents accidental slices when clicking to select existing slices
                 if (endX - startX > 5) {
                     const totalWidth = rect.width; 
                     const startTime = (startX / totalWidth) * audioBuffer.duration;
                     const endTime = (endX / totalWidth) * audioBuffer.duration;
                     onRegionSlice(startTime, endTime);
                 }
                 
                 setDragStart(null);
                 setDragCurrent(null);
             }
        };

        if (dragStart !== null) {
            window.addEventListener('mousemove', handleWindowMouseMove);
            window.addEventListener('mouseup', handleWindowMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleWindowMouseMove);
            window.removeEventListener('mouseup', handleWindowMouseUp);
        };
    }, [dragStart, audioBuffer, onRegionSlice]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!audioBuffer) return;
        // Only start drag if we clicked directly on the SVG (not a child that stopped propagation)
        const rect = svgRef.current!.getBoundingClientRect();
        const x = e.clientX - rect.left;
        setDragStart(x);
        setDragCurrent(x);
    };

    // Initialize Layers (Run once)
    useEffect(() => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        
        // Setup Defs and Layers if they don't exist
        if (svg.select("#defs-layer").empty()) {
            const defs = svg.append("defs").attr("id", "defs-layer");
            
            // Pattern for disabled slices
            defs.append("pattern")
                .attr("id", "disabled-pattern")
                .attr("patternUnits", "userSpaceOnUse")
                .attr("width", 10)
                .attr("height", 10)
                .append("path")
                .attr("d", "M-1,1 l2,-2 M0,10 l10,-10 M9,11 l2,-2")
                .attr("stroke", "#444")
                .attr("stroke-width", 1);

            // Layer order determines z-index
            // REORDERED: Slices background first, then waveform on top
            svg.append("g").attr("id", "slices-layer");
            svg.append("g").attr("id", "waveform-layer");
            svg.append("g").attr("id", "playback-layer");
            svg.append("g").attr("id", "selection-layer"); // Add selection layer on top
        }
    }, []);

    // 1. Draw Waveform (Heavy Computation)
    useEffect(() => {
        if (!audioBuffer || !svgRef.current || containerWidth === 0) return;

        const svg = d3.select(svgRef.current);
        const layer = svg.select("#waveform-layer");
        layer.selectAll("*").remove();

        const totalWidth = containerWidth * zoom;
        const height = 192; // Match the new h-48

        const channelData = audioBuffer.getChannelData(0);
        const samples = Math.floor(channelData.length / totalWidth);
        
        // Downsample for display
        const downsampledData: number[] = [];
        for (let i = 0; i < totalWidth; i++) {
            let max = 0;
            const step = Math.max(1, Math.floor(samples));
            for (let j = 0; j < step; j++) {
                const val = channelData[Math.floor(i * samples) + j];
                if (Math.abs(val) > max) max = Math.abs(val);
            }
            downsampledData.push(max);
        }

        const x = d3.scaleLinear().domain([0, downsampledData.length]).range([0, totalWidth]);
        
        // Changed from AREA to LINE/STROKE Logic for transparency
        const area = d3.area()
            .x((d: any, i: number) => x(i))
            .y0(height / 2)
            .y1((d: any) => height/2 + (d * height/2));

        const areaNegative = d3.area()
            .x((d: any, i: number) => x(i))
            .y0(height / 2)
            .y1((d: any) => height/2 - (d * height/2));
            
        // Render Waveform as a stroke-heavy shape with low fill opacity
        // This allows the slice colors underneath to be very visible
        layer.append('path')
            .datum(downsampledData)
            .attr('d', area)
            .attr('fill', '#ffffff')
            .attr('fill-opacity', 0.15) // Transparent fill
            .attr('stroke', '#ffffff')    // Crisp outline
            .attr('stroke-width', 0.5)
            .attr('opacity', 1.0);

        layer.append('path')
            .datum(downsampledData)
            .attr('d', areaNegative)
            .attr('fill', '#ffffff')
            .attr('fill-opacity', 0.15)
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 0.5)
            .attr('opacity', 1.0);
        
    }, [audioBuffer, containerWidth, zoom]); // Only redraw waveform if buffer/zoom changes

    // 2. Draw Slices Overlay (Medium Computation)
    useEffect(() => {
        if (!audioBuffer || !svgRef.current || containerWidth === 0) return;
        const svg = d3.select(svgRef.current);
        const layer = svg.select("#slices-layer");
        layer.selectAll("*").remove();

        const totalWidth = containerWidth * zoom;
        const height = 192; // Match h-48
        const duration = audioBuffer.duration;
        
        const getTypeColor = (type: SliceType) => {
            switch (type) {
                case 'kick': return '#ef4444'; // Red-500
                case 'snare': return '#eab308'; // Yellow-500
                case 'hihat': return '#00f6ff'; // Cyan
                case 'perc': return '#a855f7'; // Purple-500
                default: return '#ffffff';
            }
        };

        if (slices.length > 0) {
            slices.forEach((slice, index) => {
                const xPos = (slice.offset / duration) * totalWidth;
                const w = (slice.duration / duration) * totalWidth;
                const color = getTypeColor(slice.type);
                
                // Group for slice
                const g = layer.append('g')
                    .attr('class', 'slice-group')
                    .attr('cursor', 'pointer');

                // Background/Fill - BEHIND WAVEFORM
                let fill = 'transparent';
                if (!slice.isActive) {
                     fill = 'url(#disabled-pattern)';
                } else {
                     // High Opacity because it's behind the waveform
                     fill = index === selectedSliceIndex 
                        ? color + 'D9' // 85% opacity (Selected)
                        : color + '66'; // 40% opacity (Unselected - visible enough)
                }
                
                // Overlay for disabled state
                if (!slice.isActive) {
                     g.append('rect')
                        .attr('x', xPos)
                        .attr('y', 0)
                        .attr('width', w)
                        .attr('height', height)
                        .attr('fill', 'rgba(0,0,0,0.6)');
                }

                g.append('rect')
                    .attr('x', xPos)
                    .attr('y', 0)
                    .attr('width', w)
                    .attr('height', height)
                    .attr('fill', fill)
                    // Add distinct border
                    .attr('stroke', index === selectedSliceIndex ? '#ffffff' : color)
                    .attr('stroke-width', index === selectedSliceIndex ? 2 : 0)
                    .attr('stroke-opacity', 1);
                
                // Click to select & Play
                g.on('click', (e: Event) => {
                    e.stopPropagation(); 
                    onSliceSelect(index);
                    // Play if not currently running sequencer
                    if (!isPlayingRef.current) {
                        onPlaySlice(index);
                    }
                });
                
                // Double click to toggle active state
                g.on('dblclick', (e: Event) => {
                    e.stopPropagation();
                    onSliceToggle(index);
                });

                // Slice ID and Type Label
                if (w > 15) {
                    // ID
                    g.append('text')
                        .attr('x', xPos + 4)
                        .attr('y', 15)
                        .attr('fill', !slice.isActive ? '#999' : (index === selectedSliceIndex ? '#fff' : 'rgba(255,255,255,0.9)'))
                        .attr('font-size', '10px')
                        .attr('font-weight', 'bold')
                        .text(slice.id)
                        .style('text-decoration', !slice.isActive ? 'line-through' : 'none');
                    
                    // Type (K, S, H, P)
                    let typeLabel = 'P';
                    if (slice.type === 'kick') typeLabel = 'K';
                    else if (slice.type === 'snare') typeLabel = 'S';
                    else if (slice.type === 'hihat') typeLabel = 'H';
                    
                    if (w > 25 && slice.isActive) {
                        g.append('text')
                            .attr('x', xPos + 4)
                            .attr('y', height - 8)
                            .attr('fill', '#fff')
                            .attr('font-size', '9px')
                            .attr('font-weight', 'bold')
                            .attr('opacity', 0.9)
                            .text(typeLabel);
                    }
                }
            });
        }
    }, [slices, selectedSliceIndex, containerWidth, zoom, audioBuffer, onSliceSelect, onSliceToggle, onPlaySlice]);

    // 3. Draw Playback Highlight (Fast Update)
    useEffect(() => {
        if (!audioBuffer || !svgRef.current || containerWidth === 0) return;
        const svg = d3.select(svgRef.current);
        const layer = svg.select("#playback-layer");
        layer.selectAll("*").remove();

        const totalWidth = containerWidth * zoom;
        const height = 192; // Match h-48
        const duration = audioBuffer.duration;

        if (sequencer.isPlaying && sequencer.currentStep !== -1) {
            const currentStepData = sequencer.steps[sequencer.currentStep];
            if (currentStepData && currentStepData.active) {
                const activeSlice = slices[currentStepData.sliceIndex % slices.length];
                if (activeSlice) {
                    const startX = (activeSlice.offset / duration) * totalWidth;
                    const endX = ((activeSlice.offset + activeSlice.duration) / duration) * totalWidth;
                    const width = Math.max(1, endX - startX);
                    
                    // Highlight Rect
                    layer.append('rect')
                        .attr('x', startX)
                        .attr('y', 0)
                        .attr('width', width)
                        .attr('height', height)
                        .attr('fill', 'rgba(255, 255, 255, 0.5)') 
                        .attr('stroke', '#ffffff')
                        .attr('stroke-width', 2)
                        .attr('pointer-events', 'none');
                }
            }
        }
    }, [sequencer.currentStep, sequencer.isPlaying, slices, audioBuffer, containerWidth, zoom, sequencer.steps]);

    // 4. Draw Selection Overlay
    useEffect(() => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        const layer = svg.select("#selection-layer");
        layer.selectAll("*").remove();
        
        if (dragStart !== null && dragCurrent !== null) {
            const start = Math.min(dragStart, dragCurrent);
            const width = Math.abs(dragCurrent - dragStart);
            
            if (width > 0) {
                layer.append("rect")
                    .attr("x", start)
                    .attr("y", 0)
                    .attr("width", width)
                    .attr("height", 192) // Match h-48
                    .attr("fill", "rgba(255, 255, 255, 0.2)")
                    .attr("stroke", "white")
                    .attr("stroke-width", 1)
                    .attr("stroke-dasharray", "4,2");
            }
        }
    }, [dragStart, dragCurrent]);


    const currentSliceType = selectedSliceIndex !== null && slices[selectedSliceIndex] ? slices[selectedSliceIndex].type : null;

    const ClassificationButton = ({ type, color, label }: { type: SliceType, color: string, label: string }) => {
        const isActive = currentSliceType === type;
        // Tailwind classes for colors
        let colorClasses = "";
        let borderClass = "";
        
        if (type === 'kick') { colorClasses = "text-red-500 bg-red-500/10 hover:bg-red-500/20"; borderClass = "border-red-500"; }
        else if (type === 'snare') { colorClasses = "text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20"; borderClass = "border-yellow-500"; }
        else if (type === 'hihat') { colorClasses = "text-cyan-400 bg-cyan-400/10 hover:bg-cyan-400/20"; borderClass = "border-cyan-400"; }
        else { colorClasses = "text-purple-400 bg-purple-400/10 hover:bg-purple-400/20"; borderClass = "border-purple-400"; }

        const activeClasses = isActive 
            ? `bg-opacity-100 ${colorClasses.replace('/10', '/30')} border ${borderClass} shadow-[0_0_10px_rgba(255,255,255,0.2)]` 
            : `border border-white/10 opacity-70 hover:opacity-100 hover:border-white/30`;

        return (
            <button 
                onClick={() => selectedSliceIndex !== null && onSliceTypeChange(selectedSliceIndex, type)}
                className={`flex-1 flex flex-row items-center justify-center gap-2 py-1.5 px-2 rounded-md transition-all duration-200 group ${activeClasses}`}
                title={`Set Selected Slice to ${label}`}
                disabled={selectedSliceIndex === null}
            >
                <div className={`w-2 h-2 rounded-full transition-transform group-hover:scale-125 ${isActive ? 'bg-white' : ''}`} style={{ backgroundColor: isActive ? '#fff' : color }}></div>
                <span className={`text-[9px] font-bold uppercase tracking-wider ${isActive ? 'text-white' : 'text-star-dust'}`}>{label}</span>
            </button>
        );
    }

    return (
        <div className="space-y-2">
            {/* Scrollable Container */}
            <div 
                ref={containerRef} 
                className="w-full h-48 bg-[#0a0d14] rounded-lg ring-1 ring-white/10 overflow-x-auto overflow-y-hidden relative scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent cursor-crosshair"
            >
                {!audioBuffer && (
                    <div className="w-full h-full flex items-center justify-center text-star-dust/50 absolute top-0 left-0">
                        <p>Load a sample to see waveform</p>
                    </div>
                )}
                <svg 
                    ref={svgRef} 
                    width={containerWidth * zoom} 
                    height="100%" 
                    style={{ minWidth: '100%' }}
                    onMouseDown={handleMouseDown}
                />
            </div>
             
             {/* Controls Bar Below Waveform */}
             <div className="flex flex-col sm:flex-row justify-between items-center gap-2 p-1 bg-deep-space/30 rounded border border-white/5">
                 
                 {/* Classification Buttons */}
                 <div className="flex gap-1 w-full sm:w-2/3">
                    <ClassificationButton type="kick" color="#ef4444" label="Kick" />
                    <ClassificationButton type="snare" color="#eab308" label="Snare" />
                    <ClassificationButton type="hihat" color="#00f6ff" label="Hat" />
                    <ClassificationButton type="perc" color="#a855f7" label="Perc" />
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded-md border border-white/5 h-8">
                    <span className="uppercase text-[9px] font-bold text-star-dust/50 tracking-widest hidden sm:inline mr-2">Zoom</span>
                    <button onClick={() => setZoom(Math.max(1, zoom - 0.5))} className="w-6 h-full flex items-center justify-center bg-white/5 rounded hover:bg-white/20 text-white font-mono text-sm">-</button>
                    <span className="w-10 text-center text-xs font-mono text-hyper-cyan">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(Math.min(10, zoom + 0.5))} className="w-6 h-full flex items-center justify-center bg-white/5 rounded hover:bg-white/20 text-white font-mono text-sm">+</button>
                </div>
            </div>
        </div>
    );
};

export default WaveformDisplay;
