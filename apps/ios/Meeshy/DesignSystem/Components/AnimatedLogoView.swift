import SwiftUI

struct MeeshyDashesShape: Shape {
    let dashIndex: Int // 0, 1, or 2
    
    func path(in rect: CGRect) -> Path {
        let scale = min(rect.width, rect.height) / 1024.0
        let xOffset = (rect.width - (1024 * scale)) / 2
        let yOffset = (rect.height - (1024 * scale)) / 2
        
        var path = Path()
        
        // Stacked Dashes Geometry (from SVG)
        // Top (Long): M262 384 H762 (Width 500)
        // Middle (Medium): M262 512 H662 (Width 400)
        // Bottom (Short): M262 640 H562 (Width 300)
        
        if dashIndex == 0 {
            path.move(to: CGPoint(x: 262, y: 384))
            path.addLine(to: CGPoint(x: 762, y: 384))
        } else if dashIndex == 1 {
            path.move(to: CGPoint(x: 262, y: 512))
            path.addLine(to: CGPoint(x: 662, y: 512))
        } else if dashIndex == 2 {
            path.move(to: CGPoint(x: 262, y: 640))
            path.addLine(to: CGPoint(x: 562, y: 640))
        }
        
        return path.applying(CGAffineTransform(scaleX: scale, y: scale).concatenating(CGAffineTransform(translationX: xOffset, y: yOffset)))
    }
}

struct AnimatedLogoView: View {
    @State private var showDash1 = false
    @State private var showDash2 = false
    @State private var showDash3 = false
    
    var color: Color = .white
    var lineWidth: CGFloat = 8
    
    var body: some View {
        ZStack {
            // Dash 1 (Top)
            MeeshyDashesShape(dashIndex: 0)
                .trim(from: 0, to: showDash1 ? 1 : 0)
                .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .animation(.easeOut(duration: 0.4), value: showDash1)
            
            // Dash 2 (Middle)
            MeeshyDashesShape(dashIndex: 1)
                .trim(from: 0, to: showDash2 ? 1 : 0)
                .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .animation(.easeOut(duration: 0.4).delay(0.2), value: showDash2)
            
            // Dash 3 (Bottom)
            MeeshyDashesShape(dashIndex: 2)
                .trim(from: 0, to: showDash3 ? 1 : 0)
                .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .animation(.easeOut(duration: 0.4).delay(0.4), value: showDash3)
        }
        .aspectRatio(1, contentMode: .fit)
        .onAppear {
            showDash1 = true
            showDash2 = true
            showDash3 = true
        }
    }
    
    // Function to reset animation if needed
    func reset() {
        showDash1 = false
        showDash2 = false
        showDash3 = false
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            showDash1 = true
            showDash2 = true
            showDash3 = true
        }
    }
}

struct AnimatedLogoView_Previews: PreviewProvider {
    static var previews: some View {
        ZStack {
            Color.blue.edgesIgnoringSafeArea(.all)
            AnimatedLogoView()
                .frame(width: 200, height: 200)
        }
    }
}
