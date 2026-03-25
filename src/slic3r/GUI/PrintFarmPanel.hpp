#ifndef slic3r_PrintFarmPanel_hpp_
#define slic3r_PrintFarmPanel_hpp_

#include <wx/panel.h>
#include <wx/sizer.h>
#include <wx/button.h>
#include <wx/textctrl.h>
#include <wx/stattext.h>
#include <wx/radiobut.h>
#include "PrinterWebView.hpp"

namespace Slic3r {
namespace GUI {

class PrintFarmPanel : public wxPanel {
public:
    PrintFarmPanel(wxWindow* parent);
    virtual ~PrintFarmPanel() {}

    void load_url(const wxString& url);
    PrinterWebView* get_webview() { return m_webview; }

private:
    void build_setup_page();
    void show_setup();
    void show_webview();
    void on_server_install();
    void on_client_connect();
    void start_server();

    wxPanel*        m_setup_panel{nullptr};
    PrinterWebView* m_webview{nullptr};
    wxBoxSizer*     m_main_sizer{nullptr};

    wxTextCtrl*     m_storage_path_input{nullptr};
    wxTextCtrl*     m_server_url_input{nullptr};
    wxTextCtrl*     m_admin_username{nullptr};
    wxTextCtrl*     m_admin_password{nullptr};
    wxTextCtrl*     m_admin_password_confirm{nullptr};

    bool m_setup_done{false};
};

} // GUI
} // Slic3r

#endif
