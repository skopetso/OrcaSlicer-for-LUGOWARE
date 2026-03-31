#ifndef slic3r_PrintFarmPanel_hpp_
#define slic3r_PrintFarmPanel_hpp_

#include <wx/panel.h>
#include <wx/sizer.h>
#include <wx/button.h>
#include <wx/textctrl.h>
#include <wx/stattext.h>
#include <wx/radiobut.h>
#include <wx/timer.h>
#include <wx/progdlg.h>
#include <atomic>
#include <thread>
#include "PrinterWebView.hpp"

namespace Slic3r {
namespace GUI {

class PrintFarmPanel : public wxPanel {
public:
    PrintFarmPanel(wxWindow* parent);
    virtual ~PrintFarmPanel() {}

    void load_url(const wxString& url);
    PrinterWebView* get_webview() { return m_webview; }

    void toggle_server();
    void update_tab_label();
    bool is_server_mode() const;
    bool is_server_running() const { return m_server_running; }
    void enable_toggle() { m_toggle_enabled = true; }
    void shutdown_server();

private:
    void build_setup_page();
    void show_setup();
    void show_webview();
    void on_start_server();
    void on_client_connect();
    void start_server();
    void stop_server();
    void copy_resources_to_appdata();
    void poll_server_ready();
    void on_poll_timer(wxTimerEvent&) { poll_server_ready(); }

    wxPanel*        m_setup_panel{nullptr};
    PrinterWebView* m_webview{nullptr};
    wxBoxSizer*     m_main_sizer{nullptr};
    wxPanel*        m_server_toolbar{nullptr};
    wxButton*       m_restart_btn{nullptr};
    wxButton*       m_stop_btn{nullptr};

    wxTextCtrl*     m_server_url_input{nullptr};
    wxButton*       m_start_server_btn{nullptr};

    wxProgressDialog* m_progress_dlg{nullptr};
    wxTimer         m_poll_timer;
    int             m_poll_count{0};
    std::atomic<bool> m_copy_done{false};

    bool m_setup_done{false};
    bool m_server_running{false};
    bool m_toggle_enabled{false};
};

} // GUI
} // Slic3r

#endif
