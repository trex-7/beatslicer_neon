
import React from 'react';
import Tooltip from './Tooltip';

interface SliderProps {
    label: string;
    min: number;
    max: number;
    step: number;
    value: number | undefined | null;
    onChange: (value: number) => void;
    disabled?: boolean;
    unit?: string;
    log?: boolean;
    tooltip?: string;
    defaultValue?: number;
    precision?: number;
}

const Slider: React.FC<SliderProps> = ({ label, min, max, step, value, onChange, disabled, unit, log, tooltip, defaultValue, precision = 2 }) => {
    
    // Safety check for value
    const safeValue = typeof value === 'number' && !isNaN(value) 
        ? value 
        : (defaultValue ?? min ?? 0);

    const getLogValue = (position: number) => {
        const minLog = Math.log(min);
        const maxLog = Math.log(max);
        const scale = (maxLog - minLog) / 100;
        return Math.exp(minLog + scale * position);
    }
    
    const getLogPosition = (val: number) => {
        // Ensure val is within bounds for log calculation to avoid NaN/Infinity
        const safeVal = Math.max(min, Math.min(max, val));
        const minLog = Math.log(min);
        const maxLog = Math.log(max);
        const scale = (maxLog - minLog) / 100;
        return (Math.log(safeVal) - minLog) / scale;
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const position = parseFloat(e.target.value);
        const newValue = log ? getLogValue(position) : position;
        onChange(newValue);
    };

    const handleDoubleClick = () => {
        if (defaultValue !== undefined && !disabled) {
            onChange(defaultValue);
        }
    };

    const displayValue = safeValue.toFixed(precision);
    
    // Determine the percentage for the background fill
    const rawPos = log ? getLogPosition(safeValue) : safeValue;
    const rawMin = log ? 0 : min;
    const rawMax = log ? 100 : max;
    const percent = Math.min(100, Math.max(0, ((rawPos - rawMin) / (rawMax - rawMin)) * 100));

    return (
        <div className="w-full group">
            {/* Top Label */}
            <div className="flex justify-between items-center mb-1 select-none">
                {tooltip ? (
                    <Tooltip text={tooltip} position="top">
                         <label 
                            className="text-[10px] font-bold uppercase tracking-wider text-star-dust/70 cursor-help hover:text-hyper-cyan transition-colors truncate block max-w-full"
                            onDoubleClick={handleDoubleClick}
                        >
                            {label}
                        </label>
                    </Tooltip>
                ) : (
                    <label 
                        className="text-[10px] font-bold uppercase tracking-wider text-star-dust/70 cursor-pointer hover:text-white transition-colors truncate block max-w-full"
                        onDoubleClick={handleDoubleClick}
                    >
                        {label}
                    </label>
                )}
            </div>

            {/* Slider Track (Middle) */}
            <div className="relative h-4 flex items-center">
                 <input
                    type="range"
                    min={log ? 0 : min}
                    max={log ? 100 : max}
                    step={log ? 0.1 : step}
                    value={rawPos}
                    onChange={handleChange}
                    onDoubleClick={handleDoubleClick}
                    disabled={disabled}
                    style={{
                        background: `linear-gradient(to right, #00f6ff ${percent}%, #2a3a5e ${percent}%)`
                    }}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer 
                               focus:outline-none focus:ring-0
                               disabled:cursor-not-allowed disabled:opacity-50
                               [&::-webkit-slider-thumb]:appearance-none 
                               [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                               [&::-webkit-slider-thumb]:bg-white 
                               [&::-webkit-slider-thumb]:rounded-full 
                               [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(0,246,255,0.5)]
                               [&::-webkit-slider-thumb]:border-[1.5px] [&::-webkit-slider-thumb]:border-hyper-cyan
                               [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-100
                               group-hover:[&::-webkit-slider-thumb]:scale-110
                               active:[&::-webkit-slider-thumb]:scale-95
                               "
                />
            </div>

            {/* Value Display (Bottom Right) */}
            <div className="flex justify-end -mt-0.5">
                {label && (
                    <span 
                        className="text-[10px] font-mono text-hyper-cyan bg-hyper-cyan/5 border border-hyper-cyan/10 px-1.5 py-0.5 rounded cursor-pointer hover:bg-hyper-cyan/20 transition-colors"
                        onDoubleClick={handleDoubleClick}
                        title="Double-click to reset"
                    >
                        {displayValue}{unit && <span className="text-white/5 ml-0.5">{unit}</span>}
                    </span>
                )}
            </div>
        </div>
    );
};

export default Slider;
