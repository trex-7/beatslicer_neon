
import React, { useRef, useEffect, useState } from 'react';
import type { Slice, SequencerState } from '../types';

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
}

const WaveformDisplay: React.FC<WaveformDisplayProps> = ({ 
    audioBuffer, 
    onScrub, 
    isPlaying, 
    playerRef, 
    slices, 
    sequencer, 
    selectedSliceIndex,
    onSliceSelect 
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [zoom, setZoom] = useState(1);
    const [containerWidth, setContainerWidth] = useState(0);

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

    // Draw Waveform
    useEffect(() => {
        if (!audioBuffer || !svgRef.current || containerWidth === 0) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove(); // Clear previous waveform

        const totalWidth = containerWidth * zoom;
        const height = 128; // Fixed height matching Tailwind h-32

        const channelData = audioBuffer.getChannelData(0);
        const samples = Math.floor(channelData.length / totalWidth);
        
        // Downsample for display
        const downsampledData: number[] = [];
        for (let i = 0; i < totalWidth; i++) {
            let max = 0;
            // Optimize loop: limit sampling if zoom is very high to avoid performance hits
            const step = Math.max(1, Math.floor(samples));
            for (let j = 0; j < step; j++) {
                const val = channelData[Math.floor(i * samples) + j];
                if (Math.abs(val) > max) max = Math.abs(val);
            }
            downsampledData.push(max);
        }

        const x = d3.scaleLinear().domain([0, downsampledData.length]).range([0, totalWidth]);
        // y scale not strictly needed for area, but good for calculations if needed

        const area = d3.area()
            .x((d: any, i: number) => x(i))
            .y0(height / 2)
            .y1((d: any) => height/2 + (d * height/2));

        const areaNegative = d3.area()
            .x((d: any, i: number) => x(i))
            .y0(height / 2)
            .y1((d: any) => height/2 - (d * height/2));
            
        // Defs for gradient
        const defs = svg.append("defs");
        defs.append("linearGradient")
            .attr("id", "waveform-gradient")
            .attr("x1", "0%").attr("y1", "0%")
            .attr("x2", "100%").attr("y2", "0%") // Horizontal gradient looks better for waveform
            .selectAll("stop")
            .data([
                {offset: "0%", color: "#00f6ff"},
                {offset: "100%", color: "#ff00aa"}
            ])
            .enter().append("stop")
            .attr("offset", d => d.offset)
            .attr("stop-color", d => d.color);

        // Render Waveform Paths
        svg.append('path')
            .datum(downsampledData)
            .attr('d', area)
            .attr('fill', 'url(#waveform-gradient)');

        svg.append('path')
            .datum(downsampledData)
            .attr('d', areaNegative)
            .attr('fill', 'url(#waveform-gradient)');
        
        // Draw Slices
        const duration = audioBuffer.duration;
        
        if (slices.length > 0) {
            slices.forEach((slice, index) => {
                const xPos = (slice.offset / duration) * totalWidth;
                const w = (slice.duration / duration) * totalWidth;
                
                // Group for slice
                const g = svg.append('g')
                    .attr('class', 'slice-group')
                    .attr('cursor', 'pointer');

                // Background for selection/hover detection
                g.append('rect')
                    .attr('x', xPos)
                    .attr('y', 0)
                    .attr('width', w)
                    .attr('height', height)
                    .attr('fill', index === selectedSliceIndex ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.0)')
                    .attr('stroke', index === selectedSliceIndex ? '#ffffff' : 'rgba(255,255,255,0.2)')
                    .attr('stroke-width', index === selectedSliceIndex ? 2 : 1)
                    .attr('stroke-dasharray', index === selectedSliceIndex ? 'none' : '4,2');

                // Click to select
                g.on('click', (e: Event) => {
                    e.stopPropagation();
                    onSliceSelect(index);
                });

                // Slice ID Label
                if (w > 20) { 
                    g.append('text')
                        .attr('x', xPos + 4)
                        .attr('y', 15)
                        .attr('fill', index === selectedSliceIndex ? '#fff' : 'rgba(255,255,255,0.5)')
                        .attr('font-size', '10px')
                        .attr('font-weight', 'bold')
                        .text(slice.id);
                }
            });

            // Highlight Currently Playing Slice (from Sequencer)
            if (sequencer.isPlaying && sequencer.currentStep !== -1) {
                const currentStepData = sequencer.steps[sequencer.currentStep];
                if (currentStepData && currentStepData.active) {
                    const activeSlice = slices[currentStepData.sliceIndex % slices.length];
                    if (activeSlice) {
                        const startX = (activeSlice.offset / duration) * totalWidth;
                        const endX = ((activeSlice.offset + activeSlice.duration) / duration) * totalWidth;
                        
                        svg.append('rect')
                            .attr('x', startX)
                            .attr('y', 0)
                            .attr('width', Math.max(1, endX - startX))
                            .attr('height', height)
                            .attr('fill', 'rgba(0, 246, 255, 0.3)') // Cyan highlight for playback
                            .attr('pointer-events', 'none');
                    }
                }
            }
        }

        // Global click to scrub if not clicking a slice
        /*
        svg.on('click', (event: MouseEvent) => {
             // Use D3 to get coordinates relative to SVG
             const [mouseX] = d3.pointer(event);
             const position = mouseX / totalWidth;
             onScrub(position);
        });
        */
       // Note: Scrubbing conflicts with Slice selection slightly unless we are careful. 
       // For now, clicking a slice selects it. We can add a scrub bar at top if needed.

    }, [audioBuffer, containerWidth, zoom, slices, sequencer.currentStep, sequencer.isPlaying, selectedSliceIndex, onSliceSelect]); // Removed direct dependency on sequencer.steps to avoid redraw on non-visual changes

    return (
        <div className="space-y-2">
            {/* Zoom Controls */}
            <div className="flex justify-between items-center text-xs text-star-dust/70 uppercase tracking-widest">
                <span>Waveform</span>
                <div className="flex items-center gap-2">
                    <span>Zoom</span>
                    <button onClick={() => setZoom(Math.max(1, zoom - 0.5))} className="px-2 py-0.5 bg-white/10 rounded hover:bg-white/20">-</button>
                    <span className="w-8 text-center">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(Math.min(10, zoom + 0.5))} className="px-2 py-0.5 bg-white/10 rounded hover:bg-white/20">+</button>
                </div>
            </div>

            {/* Scrollable Container */}
            <div 
                ref={containerRef} 
                className="w-full h-32 bg-deep-space/50 rounded-lg ring-1 ring-white/10 overflow-x-auto overflow-y-hidden relative scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
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
                />
            </div>
             <div className="text-[10px] text-center text-star-dust/40 mt-1">
                Click a slice to select it (White). Assign selected slice to Sequencer pads below.
            </div>
        </div>
    );
};

export default WaveformDisplay;
