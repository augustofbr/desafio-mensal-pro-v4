
import * as React from "react";
import { Line, LineChart as RechartsLineChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, Label } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useIsMobile } from "@/hooks/use-mobile";

interface LineChartProps {
  data: any;
  showEndLabels?: boolean;
  showEnhancedTooltips?: boolean;
  legendPosition?: 'top' | 'bottom';
  xAxisLabel?: string;
  yAxisLabel?: string;
}

export function LineChart({
  data,
  showEndLabels = false,
  showEnhancedTooltips = false,
  legendPosition = 'top',
  xAxisLabel,
  yAxisLabel,
}: LineChartProps) {
  const isMobile = useIsMobile();

  const config = React.useMemo(() => {
    const colors = [
      { color: "#2563eb" }, // blue-600
      { color: "#db2777" }, // pink-600
      { color: "#16a34a" }, // green-600
      { color: "#ea580c" }, // orange-600
      { color: "#9333ea" }, // purple-600
      { color: "#e11d48" }, // rose-600
      { color: "#0891b2" }, // cyan-600
      { color: "#854d0e" }, // amber-600
    ];

    return data.datasets?.reduce(
      (acc: Record<string, any>, dataset: any, i: number) => {
        const id = dataset.label || `dataset-${i}`;
        return {
          ...acc,
          [id]: colors[i % colors.length],
        };
      },
      {}
    );
  }, [data]);

  const chartData = React.useMemo(() => {
    if (!data?.labels || !data?.datasets) {
      return [];
    }

    return data.labels.map((label: string, i: number) => ({
      name: label,
      index: i,
      ...data.datasets.reduce((acc: Record<string, any>, dataset: any) => {
        const id = dataset.label || `dataset-${dataset.index || 0}`;
        return {
          ...acc,
          [id]: dataset.data[i] || 0,
        };
      }, {}),
    }));
  }, [data]);

  const effectiveShowEndLabels = showEndLabels && !isMobile;

  const renderEndLabel = (props: any) => {
    const { payload, x, y, dataKey } = props;
    const lastIndex = chartData.length - 1;
    const currentIndex = payload?.index || 0;

    if (currentIndex !== lastIndex || !effectiveShowEndLabels) {
      return null;
    }

    const professionalName = dataKey || 'Unknown';

    return (
      <text
        x={x + 8}
        y={y - 5}
        fill="currentColor"
        fontSize={12}
        fontWeight="500"
        className="fill-foreground"
      >
        {professionalName}
      </text>
    );
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }

    return (
      <div className="bg-background border border-border rounded-lg p-3 shadow-lg max-w-[280px]">
        <p className="font-medium text-foreground mb-2">
          Dia {label}
        </p>
        <div className="space-y-1">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-xs text-muted-foreground truncate">
                {entry.dataKey}:
              </span>
              <span className="text-xs font-medium text-foreground whitespace-nowrap">
                {entry.value} pts
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const effectiveLegendPosition = isMobile ? 'bottom' : legendPosition;

  return (
    <div className="w-full h-full">
      <ChartContainer config={config || {}} className="!aspect-auto h-full">
        <RechartsLineChart
          data={chartData}
          margin={{
            top: isMobile ? 10 : 20,
            right: effectiveShowEndLabels ? 120 : (isMobile ? 10 : 30),
            left: isMobile ? 0 : 20,
            bottom: isMobile ? 5 : 15
          }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
          <XAxis
            dataKey="name"
            axisLine={true}
            tickLine={true}
            tick={{ fontSize: isMobile ? 9 : 12 }}
            interval={isMobile ? 2 : 0}
            angle={-45}
            textAnchor="end"
            height={isMobile ? 35 : 55}
          >
            {xAxisLabel && !isMobile && (
              <Label value={xAxisLabel} position="insideBottom" offset={-5} style={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
            )}
          </XAxis>
          <YAxis
            domain={[0, 'dataMax']}
            axisLine={true}
            tickLine={true}
            tick={{ fontSize: isMobile ? 9 : 12 }}
            width={isMobile ? 30 : 45}
          >
            {yAxisLabel && !isMobile && (
              <Label value={yAxisLabel} angle={-90} position="insideLeft" offset={10} style={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
            )}
          </YAxis>
          {showEnhancedTooltips ? (
            <Tooltip content={<CustomTooltip />} />
          ) : (
            <ChartTooltip content={<ChartTooltipContent />} />
          )}
          <Legend
            verticalAlign={effectiveLegendPosition}
            wrapperStyle={{
              paddingTop: effectiveLegendPosition === 'bottom' ? '8px' : '4px',
              paddingBottom: effectiveLegendPosition === 'top' ? '8px' : '0',
              fontSize: isMobile ? '10px' : '13px',
              fontWeight: '500'
            }}
            iconSize={isMobile ? 8 : 14}
          />
          {data.datasets?.map((dataset: any, i: number) => (
            <Line
              key={`line-${i}`}
              type="monotone"
              dataKey={dataset.label || `dataset-${i}`}
              stroke={dataset.borderColor || config[dataset.label || `dataset-${i}`]?.color}
              activeDot={{ r: isMobile ? 4 : 7, strokeWidth: 2 }}
              strokeWidth={isMobile ? 2 : 3}
              dot={isMobile ? false : { strokeWidth: 2, r: 3 }}
            >
              {effectiveShowEndLabels && (
                <LabelList
                  content={renderEndLabel}
                  position="insideTopRight"
                />
              )}
            </Line>
          ))}
        </RechartsLineChart>
      </ChartContainer>
    </div>
  );
}
