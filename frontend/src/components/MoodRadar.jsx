import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    ResponsiveContainer,
} from "recharts";

const MoodRadar = ({ data }) => {
    // Normalize tempo to 0-1 scale (assuming max ~180bpm)
    const normalizedTempo = Math.min((data.avgTempo || 0) / 180, 1);

    const chartData = [
        { subject: "Dance", A: (data.avgDanceability || 0) * 100, fullMark: 100 },
        { subject: "Happy", A: (data.avgMood || 0) * 100, fullMark: 100 },
        { subject: "Party", A: (data.avgParty || 0) * 100, fullMark: 100 },
        { subject: "Energy", A: (data.avgAggressive || 0) * 100, fullMark: 100 },
        { subject: "Speed", A: normalizedTempo * 100, fullMark: 100 },
    ];

    return (
        <div className="w-full h-64 md:h-80 relative">
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
                    <PolarGrid stroke="rgba(255,255,255,0.2)" />
                    <PolarAngleAxis
                        dataKey="subject"
                        tick={{ fill: "#00f3ff", fontSize: 12, fontFamily: "Righteous" }}
                    />
                    <Radar
                        name="Playlist Vibe"
                        dataKey="A"
                        stroke="#ff007f"
                        strokeWidth={3}
                        fill="#ff007f"
                        fillOpacity={0.5}
                    />
                </RadarChart>
            </ResponsiveContainer>

            {/* Decorative center glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-[var(--color-neon-pink)] opacity-20 blur-xl rounded-full pointer-events-none"></div>
        </div>
    );
};

export default MoodRadar;
