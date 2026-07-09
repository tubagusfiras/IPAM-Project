import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
          background:"var(--bg)", color:"var(--text)", fontFamily:"var(--font-main)",
          padding:20, textAlign:"center",
        }}>
          <div>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="1.5" width="48" height="48" style={{marginBottom:16}}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <h2 style={{fontSize:18,fontWeight:700,margin:"0 0 4px"}}>Something went wrong</h2>
            <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:20,maxWidth:400}}>
              An unexpected error occurred. Please refresh the page.
            </p>
            <button onClick={()=>{this.setState({hasError:false,error:null});window.location.reload();}}
              style={{
                padding:"10px 24px", fontSize:14, fontWeight:600, borderRadius:"var(--radius-sm)",
                background:"var(--accent)", color:"#fff", border:"none", cursor:"pointer",
              }}>Refresh Page</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
