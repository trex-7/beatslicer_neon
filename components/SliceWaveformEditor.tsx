
import React, { useRef, useEffect, useState } from 'react';
import type { Slice } from '../types';

declare const d3: any;

interface SliceWaveformEditorProps {
    audioBuffer: any;
    slice: Slice;
    onUpdate: (changes: Partial<Slice>) => void;
}

const SliceWaveformEditor: React.FC<SliceWaveformEditorProps> = ({ audioBuffer, slice, onUpdate }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);

    // Resize observer to handle responsive width
    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver(entries => {
            if (entries[0]) {
                setWidth(entries[0].contentRect.width);
            }
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        if (!audioBuffer || !slice || !svgRef.current || width === 0) return;

        // Handle Tone.Buffer wrapper vs Native AudioBuffer
        const rawBuffer = audioBuffer.get ? audioBuffer.get() : audioBuffer;
        const duration = rawBuffer.duration;
        const channelData = rawBuffer.getChannelData(0);

        // Define View Window (Slice + context padding)
        const padding = 0.1; // 100ms padding
        const viewStart = Math.max(0, slice.offset - padding);
        const viewEnd = Math.min(duration, slice.offset + slice.duration + padding);
        const viewDuration = viewEnd - viewStart;
        
        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove();

        const height = 96; // Fixed height matching CSS h-24

        // Scales
        const xScale = d3.scaleLinear()
            .domain([viewStart, viewEnd])
            .range([0, width]);

        const yScale = d3.scaleLinear()
            .domain([-1, 1])
            .range([height, 0]);

        // --- Data Extraction ---
        // Downsample logic for performance
        const sampleRate = rawBuffer.sampleRate;
        const startSample = Math.floor(viewStart * sampleRate);
        const endSample = Math.floor(viewEnd * sampleRate);
        const totalSamples = endSample - startSample;
        // Aim for roughly 1 point per pixel
        const step = Math.max(1, Math.floor(totalSamples / width));
        
        const data = [];
        for (let i = startSample; i < endSample; i += step) {
            data.push(channelData[i]);
        }

        // --- Drawing ---

        // Area Generator
        const area = d3.area()
            .x((d: number, i: number) => xScale(viewStart + (i * step / sampleRate)))
            .y0(height / 2)
            .y1((d: number) => yScale(d));

        // 1. Background
        svg.append("rect")
            .attr("width", width)
            .attr("height", height)
            .attr("fill", "#0f1319"); // Very dark background

        // 2. Waveform (Context)
        svg.append("path")
            .datum(data)
            .attr("fill", "#2a3a5e") // Dim blue for outside context
            .attr("opacity", 0.5)
            .attr("d", area);

        // 3. Active Slice Region
        const clipId = `slice-clip-${slice.id}`;
        
        const defs = svg.append("defs");
        
        defs.append("clipPath")
            .attr("id", clipId)
            .append("rect")
            .attr("x", xScale(slice.offset))
            .attr("y", 0)
            .attr("width", Math.max(1, xScale(slice.offset + slice.duration) - xScale(slice.offset)))
            .attr("height", height);

        svg.append("path")
            .datum(data)
            .attr("fill", "#00f6ff") // Bright Cyan for active
            .attr("d", area)
            .attr("clip-path", `url(#${clipId})`);
            
        // 4. Handles & Controls
        
        // Helper to create handles
        const createHandle = (x: number, type: 'start' | 'end') => {
            const g = svg.append("g")
                .attr("transform", `translate(${x}, 0)`)
                .style("cursor", "ew-resize")
                .attr("class", `handle-${type}`);

            // Vertical Line
            g.append("line")
                .attr("y1", 0).attr("y2", height)
                .attr("stroke", "#ffffff")
                .attr("stroke-width", 1.5)
                .attr("stroke-dasharray", "2,1");

            // Handle Tab (Triangle)
            g.append("path")
                .attr("d", type === 'start' ? "M0,0 L10,0 L0,10" : "M0,0 L-10,0 L0,10")
                .attr("fill", "#ffffff");
            
            // Bottom Tab
            g.append("path")
                .attr("d", type === 'start' ? `M0,${height} L10,${height} L0,${height-10}` : `M0,${height} L-10,${height} L0,${height-10}`)
                .attr("fill", "#ffffff");

            // Hit Area (Invisible wide rect for easier grabbing)
            g.append("rect")
                .attr("x", -15).attr("y", 0).attr("width", 30).attr("height", height)
                .attr("fill", "transparent");

            return g;
        };

        const startG = createHandle(xScale(slice.offset), 'start');
        const endG = createHandle(xScale(slice.offset + slice.duration), 'end');

        // Drag Behavior
        startG.call(d3.drag()
            .on("drag", (event: any) => {
                const [mouseX] = d3.pointer(event, svgRef.current);
                const currentTime = xScale.invert(mouseX);
                
                // Constraints:
                // 1. Cannot go before viewStart
                // 2. Cannot go past End - minDuration
                const currentEnd = slice.offset + slice.duration;
                const minDuration = 0.01;
                const newStart = Math.max(viewStart, Math.min(currentTime, currentEnd - minDuration));

                if (Math.abs(newStart - slice.offset) > 0.0001) {
                     // Update Offset, keep End fixed (so duration changes)
                     const newDuration = currentEnd - newStart;
                     onUpdate({ offset: newStart, duration: newDuration });
                }
            })
        );

        endG.call(d3.drag()
            .on("drag", (event: any) => {
                const [mouseX] = d3.pointer(event, svgRef.current);
                const currentTime = xScale.invert(mouseX);
                
                // Constraints:
                // 1. Cannot go before Start + minDuration
                // 2. Cannot go past viewEnd
                const currentStart = slice.offset;
                const minDuration = 0.01;
                const newEnd = Math.max(currentStart + minDuration, Math.min(currentTime, viewEnd));

                if (Math.abs(newEnd - (currentStart + slice.duration)) > 0.0001) {
                    // Update Duration only
                    const newDuration = newEnd - currentStart;
                    onUpdate({ duration: newDuration });
                }
            })
        );

    }, [audioBuffer, slice, width]); 

    return (
        <div ref={containerRef} className="w-full h-24 bg-deep-space/40 rounded border border-white/10 mb-3 relative select-none overflow-hidden">
             {!audioBuffer ? (
                 <div className="flex items-center justify-center h-full text-xs text-star-dust/30">No Data</div>
             ) : (
                 <svg ref={svgRef} width="100%" height="100%" />
             )}
             <div className="absolute top-1 right-2 text-[9px] text-white/30 pointer-events-none">
                Drag handles to adjust
             </div>
        </div>
    );
};

export default SliceWaveformEditor;
